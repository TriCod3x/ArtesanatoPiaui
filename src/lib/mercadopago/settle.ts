import { createAdminClient } from "@/lib/supabase/admin";
import { purchaseLabelForShipment } from "@/lib/melhorenvio/purchase";
import type { MPPayment } from "./client";
import type { Json } from "@/types/database";

function mapStatus(mpStatus: MPPayment["status"]): "pending" | "paid" | "failed" | "refunded" | "cancelled" {
  switch (mpStatus) {
    case "approved":
      return "paid";
    case "rejected":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return "pending";
  }
}

/**
 * Efetiva um pagamento (Pix ou cartão) de UMA loja dentro do pedido.
 * Idempotente: usa `status <> 'paid'` como compare-and-swap, então webhooks
 * duplicados (a MP reenvia) ou uma corrida com o botão "verificar status"
 * não geram comissão/confirmação em duplicidade.
 */
export async function settlePayment(params: {
  orderId: string;
  storeId: string;
  mpPayment: MPPayment;
}) {
  const admin = createAdminClient();
  const status = mapStatus(params.mpPayment.status);

  const { data: updatedPayment } = await admin
    .from("payments")
    .update({
      external_id: String(params.mpPayment.id),
      status,
      raw_payload: params.mpPayment as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", params.orderId)
    .eq("store_id", params.storeId)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();

  if (!updatedPayment) return; // já estava 'paid' (idempotência) ou pagamento não encontrado

  if (status !== "paid") return;

  const { data: items } = await admin
    .from("order_items")
    .select("id, subtotal")
    .eq("order_id", params.orderId)
    .eq("store_id", params.storeId);

  const { data: store } = await admin
    .from("stores")
    .select("commission_rate")
    .eq("id", params.storeId)
    .single();

  const commissionRate = store?.commission_rate ?? 0;

  for (const item of items ?? []) {
    const grossAmount = item.subtotal;
    const commissionAmount = Math.round(grossAmount * (commissionRate / 100) * 100) / 100;
    await admin.from("commissions").insert({
      order_item_id: item.id,
      store_id: params.storeId,
      gross_amount: grossAmount,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      net_amount: grossAmount - commissionAmount,
    });
  }

  await admin
    .from("order_items")
    .update({ item_status: "confirmed" })
    .eq("order_id", params.orderId)
    .eq("store_id", params.storeId);

  // Compra automática da etiqueta assim que ESSA loja é paga — não espera
  // as demais lojas do carrinho (cada uma tem sua própria conta/etiqueta).
  await purchaseLabelForShipment(params.orderId, params.storeId);

  // Carrinho multi-loja: só marca o pedido inteiro como confirmado quando
  // TODAS as lojas do pedido já tiverem pagamento efetivado.
  const { count: pendingCount } = await admin
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", params.orderId)
    .neq("item_status", "confirmed");

  if (pendingCount === 0) {
    await admin
      .from("orders")
      .update({ status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", params.orderId);
  }
}
