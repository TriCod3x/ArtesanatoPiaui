/**
 * Regra "loja sem Mercado Pago não vende" — lógica pura, compartilhada entre
 * o servidor (createOrder recusa) e o cliente (carrinho/checkout avisam).
 * Quem decide a conexão é a existência de credencial `mercadopago` em
 * `store_integration_credentials` (ver lib/store-credentials.ts).
 */

export const STORE_WITHOUT_PAYMENTS_LABEL = "Esta loja ainda não recebe pagamentos";

/** IDs (sem repetição) das lojas do carrinho que NÃO têm Mercado Pago conectado. */
export function findStoresWithoutPayments(
  storeIds: readonly string[],
  connectedStoreIds: Iterable<string>,
): string[] {
  const connected = new Set(connectedStoreIds);
  return [...new Set(storeIds)].filter((id) => !connected.has(id));
}

/** Mensagem para o comprador quando o pedido é recusado por causa dessa regra. */
export function storeWithoutPaymentsMessage(storeNames: readonly string[]): string {
  if (storeNames.length === 1) {
    return `${STORE_WITHOUT_PAYMENTS_LABEL}: "${storeNames[0]}". Remova os itens dela do carrinho para continuar ou volte mais tarde.`;
  }
  const list = storeNames.map((n) => `"${n}"`).join(", ");
  return `Estas lojas ainda não recebem pagamentos: ${list}. Remova os itens delas do carrinho para continuar ou volte mais tarde.`;
}
