"use server";

import { getConnectedStoreIds } from "@/lib/store-credentials";
import { findStoresWithoutPayments } from "@/lib/store-payments";

// ATENÇÃO: arquivo "use server" — exporta SOMENTE funções async. Tipos e
// constantes ficam em "@/lib/store-payments".

const MAX_STORES = 50;

/**
 * Quais das lojas informadas ainda não têm Mercado Pago conectado. Serve só
 * pra UI do carrinho/checkout avisar cedo — quem de fato bloqueia é o
 * createOrder. Não exige login (o carrinho é público) e devolve apenas um
 * booleano por loja, nunca credencial.
 */
export async function getStoresWithoutPayments(
  storeIds: string[],
): Promise<{ error: string } | { success: true; storeIds: string[] }> {
  const ids = [...new Set((Array.isArray(storeIds) ? storeIds : []).filter((s) => typeof s === "string" && s.length > 0))]
    .slice(0, MAX_STORES);
  if (ids.length === 0) return { success: true, storeIds: [] };

  try {
    const connected = await getConnectedStoreIds(ids, "mercadopago");
    return { success: true, storeIds: findStoresWithoutPayments(ids, connected) };
  } catch {
    return { error: "Não foi possível verificar os pagamentos das lojas agora." };
  }
}
