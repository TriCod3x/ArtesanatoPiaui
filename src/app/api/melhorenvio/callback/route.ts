import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeOAuthCode, verifyOAuthState, decodeJwtSubject } from "@/lib/melhorenvio/client";
import { upsertStoreCredential } from "@/lib/store-credentials";

/**
 * Callback OAuth do Melhor Envio. Mesmo padrão do callback do Mercado Pago:
 * o `state` assinado identifica a loja, e o token vai pra
 * `store_integration_credentials` (RLS sem nenhuma policy — só service role
 * lê/escreve), não pra `stores` — ver src/lib/store-credentials.ts.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const redirectTo = (status: "connected" | "error", message?: string) => {
    const url = new URL("/minha-loja/frete", request.url);
    url.searchParams.set(status === "connected" ? "connected" : "error", message ?? "1");
    return NextResponse.redirect(url);
  };

  if (oauthError) {
    return redirectTo("error", "O vendedor cancelou a autorização.");
  }
  if (!code || !state) {
    return redirectTo("error", "Requisição inválida.");
  }

  const storeId = verifyOAuthState(state);
  if (!storeId) {
    return redirectTo("error", "Link de conexão expirado. Tente novamente.");
  }

  try {
    const token = await exchangeOAuthCode(code);

    const admin = createAdminClient();
    const { data: store } = await admin.from("stores").select("id, status").eq("id", storeId).maybeSingle();
    if (!store || store.status !== "active") {
      return redirectTo("error", "Loja não encontrada ou ainda não aprovada.");
    }

    await upsertStoreCredential(storeId, "melhorenvio", {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      externalUserId: decodeJwtSubject(token.access_token),
    });

    return redirectTo("connected");
  } catch (err) {
    console.error("[melhorenvio] callback OAuth falhou:", err);
    return redirectTo("error", "Erro ao conectar com o Melhor Envio. Tente novamente.");
  }
}
