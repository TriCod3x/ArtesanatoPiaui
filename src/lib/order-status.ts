/**
 * Rótulos de status PRO COMPRADOR (tela "Meus pedidos"). O vendedor continua
 * vendo os status técnicos crus (orders.status / shipments.status) — esta
 * função não é usada em nenhuma tela voltada ao vendedor.
 *
 * `shipments.status` já é a versão normalizada (a Melhor Envio e a Uber
 * Direct têm status próprios, mapeados pros nossos valores nos webhooks —
 * ver mapShipmentStatus / mapDeliveryStatus), então não precisa reler o
 * status cru de cada operadora aqui.
 */

export type BuyerOrderStatus =
  | "aguardando_pagamento"
  | "preparando_envio"
  | "enviado"
  | "em_rota_de_entrega"
  | "entregue"
  | "cancelado";

export const BUYER_ORDER_STATUS_LABEL: Record<BuyerOrderStatus, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  preparando_envio: "Preparando envio",
  enviado: "Enviado",
  em_rota_de_entrega: "Em rota de entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const BUYER_ORDER_STATUS_CLASS: Record<BuyerOrderStatus, string> = {
  aguardando_pagamento: "bg-amber/15 text-amber",
  preparando_envio: "bg-amber/15 text-amber",
  enviado: "bg-blue-500/15 text-blue-500",
  em_rota_de_entrega: "bg-blue-500/15 text-blue-500",
  entregue: "bg-green-600/15 text-green-600",
  cancelado: "bg-destructive/15 text-destructive",
};

/**
 * `shipmentStatus` omitido quando não há frete pra considerar ainda (ex.:
 * badge geral do pedido, sem olhar uma loja específica). Enquanto o pedido
 * não estiver pago, o status do frete é ignorado de propósito — quem chama
 * deve mostrar só o método de frete escolhido, não um rótulo de logística.
 */
export function getBuyerOrderStatus(
  orderStatus: string,
  shipmentStatus?: string | null,
): BuyerOrderStatus {
  if (orderStatus === "cancelled") return "cancelado";
  if (orderStatus === "pending") return "aguardando_pagamento";

  switch (shipmentStatus) {
    case "posted":
      return "enviado";
    case "in_transit":
      return "em_rota_de_entrega";
    case "delivered":
      return "entregue";
    case "cancelled":
      return "cancelado";
    case "pending":
    case "purchased":
    default:
      return "preparando_envio";
  }
}

export function getBuyerOrderStatusLabel(orderStatus: string, shipmentStatus?: string | null): string {
  return BUYER_ORDER_STATUS_LABEL[getBuyerOrderStatus(orderStatus, shipmentStatus)];
}

/**
 * Rótulos de status PRO VENDEDOR ("Pedidos da loja"). Função separada da do
 * comprador de propósito — aqui o vocabulário é operacional (o que a artesã
 * precisa FAZER), não o estado visto de fora.
 *
 * `carrier` distingue os dois fluxos porque o mesmo `shipments.status`
 * "purchased" significa coisas diferentes: na Melhor Envio é a etiqueta
 * gerada (ver mapShipmentStatus); na Uber Direct é a corrida despachada (ver
 * dispatchExpressDelivery / mapDeliveryStatus) — não existe "etiqueta" nesse
 * fluxo. `item_status` nunca chega a 'pending' aqui (a lista já filtra só
 * itens pagos) nem passa por 'shipped' (o código nunca grava esse valor —
 * o ciclo real é pending → confirmed → delivered, com o detalhe de envio
 * vindo de shipments.status).
 */

export type SellerOrderStatus =
  | "novo_pedido"
  | "etiqueta_gerada"
  | "enviado"
  | "em_transito"
  | "entrega_expressa_a_caminho"
  | "entregue"
  | "cancelado";

export const SELLER_ORDER_STATUS_LABEL: Record<SellerOrderStatus, string> = {
  novo_pedido: "Novo pedido: preparar envio",
  etiqueta_gerada: "Etiqueta gerada",
  enviado: "Enviado",
  em_transito: "Em trânsito",
  entrega_expressa_a_caminho: "Entrega expressa a caminho",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const SELLER_ORDER_STATUS_CLASS: Record<SellerOrderStatus, string> = {
  novo_pedido: "bg-amber/15 text-amber",
  etiqueta_gerada: "bg-blue-500/15 text-blue-500",
  enviado: "bg-blue-500/15 text-blue-500",
  em_transito: "bg-blue-500/15 text-blue-500",
  entrega_expressa_a_caminho: "bg-blue-500/15 text-blue-500",
  entregue: "bg-green-600/15 text-green-600",
  cancelado: "bg-destructive/15 text-destructive",
};

export function getSellerOrderStatus(
  itemStatus: string,
  shipmentStatus?: string | null,
  carrier?: string | null,
): SellerOrderStatus {
  if (itemStatus === "cancelled") return "cancelado";
  if (itemStatus === "delivered") return "entregue";

  switch (shipmentStatus) {
    case "purchased":
      return carrier === "uber_direct" ? "entrega_expressa_a_caminho" : "etiqueta_gerada";
    case "posted":
      return "enviado";
    case "in_transit":
      return carrier === "uber_direct" ? "entrega_expressa_a_caminho" : "em_transito";
    case "delivered":
      return "entregue";
    case "cancelled":
      return "cancelado";
    case "pending":
    default:
      return "novo_pedido";
  }
}

export function getSellerOrderStatusLabel(
  itemStatus: string,
  shipmentStatus?: string | null,
  carrier?: string | null,
): string {
  return SELLER_ORDER_STATUS_LABEL[getSellerOrderStatus(itemStatus, shipmentStatus, carrier)];
}
