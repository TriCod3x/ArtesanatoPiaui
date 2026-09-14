import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeOAuthCode, verifyOAuthState } from "@/lib/mercadopago/client";

/**
 * Callback OAuth do Mercado Pago. Não usa a sessão do usuário — o `state`
 * (assinado em buildAuthorizationUrl) já identifica a loja, e a escrita dos
 * campos mp_* só é permitida via service role (trigger `enforce_store_mp_fields`).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const redirectTo = (status: "connected" | "error", message?: string) => {
    const url = new URL("/minha-loja/pagamentos", request.url);
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

    const { error } = await admin
      .from("stores")
      .update({
        mp_user_id: String(token.user_id),
        mp_access_token: token.access_token,
        mp_refresh_token: token.refresh_token,
        mp_public_key: token.public_key,
        mp_connected_at: new Date().toISOString(),
      })
      .eq("id", storeId);

    if (error) return redirectTo("error", "Erro ao salvar a conexão. Tente novamente.");

    return redirectTo("connected");
  } catch (err) {
    console.error("[mercadopago] callback OAuth falhou:", err);
    return redirectTo("error", "Erro ao conectar com o Mercado Pago. Tente novamente.");
  }
}
