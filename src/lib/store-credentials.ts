import { createAdminClient } from "@/lib/supabase/admin";

export type IntegrationProvider = "mercadopago" | "melhorenvio";

export interface StoreCredential {
  accessToken: string;
  refreshToken: string | null;
  externalUserId: string | null;
  publicKey: string | null;
  connectedAt: string;
}

/**
 * `store_integration_credentials` guarda os tokens OAuth de cada loja
 * (Mercado Pago e Melhor Envio). A tabela tem RLS ligado e ZERO policies —
 * nem o dono da loja lê pela própria sessão — de propósito: uma tentativa
 * anterior de proteger o token com `REVOKE SELECT (coluna)` direto em
 * `stores` não se sustentou nesse ambiente Supabase (a coluna continuava
 * legível por anon/authenticated apesar do REVOKE). Isolar numa tabela sem
 * policy nenhuma é o mesmo padrão já usado em `seller_verifications`.
 * Por isso: só chame essas funções em código server-only (server actions,
 * route handlers, lib) — nunca a partir de um client component.
 */
export async function getStoreCredential(
  storeId: string,
  provider: IntegrationProvider,
): Promise<StoreCredential | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_integration_credentials")
    .select("access_token, refresh_token, external_user_id, public_key, connected_at")
    .eq("store_id", storeId)
    .eq("provider", provider)
    .maybeSingle();

  if (!data) return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    externalUserId: data.external_user_id,
    publicKey: data.public_key,
    connectedAt: data.connected_at,
  };
}

/** Pra várias lojas de uma vez (checkout multi-loja) — evita N round-trips. */
export async function getStoreCredentialsByStoreIds(
  storeIds: string[],
  provider: IntegrationProvider,
): Promise<Map<string, StoreCredential>> {
  if (storeIds.length === 0) return new Map();
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_integration_credentials")
    .select("store_id, access_token, refresh_token, external_user_id, public_key, connected_at")
    .in("store_id", storeIds)
    .eq("provider", provider);

  const map = new Map<string, StoreCredential>();
  for (const row of data ?? []) {
    map.set(row.store_id, {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      externalUserId: row.external_user_id,
      publicKey: row.public_key,
      connectedAt: row.connected_at,
    });
  }
  return map;
}

/** Status de conexão pra UI — nunca retorna o token em si. */
export async function isStoreConnected(storeId: string, provider: IntegrationProvider): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("store_integration_credentials")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("provider", provider);
  return (count ?? 0) > 0;
}

export async function upsertStoreCredential(
  storeId: string,
  provider: IntegrationProvider,
  values: { accessToken: string; refreshToken?: string | null; externalUserId?: string | null; publicKey?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("store_integration_credentials").upsert(
    {
      store_id: storeId,
      provider,
      access_token: values.accessToken,
      refresh_token: values.refreshToken ?? null,
      external_user_id: values.externalUserId ?? null,
      public_key: values.publicKey ?? null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,provider" },
  );
}
