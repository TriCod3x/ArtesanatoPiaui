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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Resultado de settlePayment — `settled: false` quando nada foi gravado. */
export type SettleResult = { settled: true } | { settled: false; reason: string };

/**
 * Efetiva um pagamento (Pix ou cartão) de UMA loja dentro do pedido.
 * Idempotente: usa `status <> 'paid'` como compare-and-swap, então webhooks
 * duplicados (a MP reenvia) ou uma corrida com o botão "verificar status"
 * não geram comissão/confirmação em duplicidade.
 *
 * A assinatura do webhook cobre só `data.id` — `order_id`/`store_id` vêm da
 * query string e são adulteráveis. Por isso o pagamento consultado na MP é
 * confrontado aqui com o pedido: `external_reference` tem que ser exatamente
 * `orderId:storeId` e o `transaction_amount` tem que bater com o valor já
 * gravado em payments. Sem essas duas checagens, a notificação legítima de um
 * pagamento barato poderia ser reenviada apontando pra outro pedido.
 */
export async function settlePayment(params: {
  orderId: string;
  storeId: string;
  mpPayment: MPPayment;
}): Promise<SettleResult> {
  const admin = createAdminClient();
  const status = mapStatus(params.mpPayment.status);

  const expectedReference = `${params.orderId}:${params.storeId}`;
  if (params.mpPayment.external_reference !== expectedReference) {
    console.error("[mercadopago][auditoria] external_reference não confere — pagamento recusado", {
      paymentId: params.mpPayment.id,
      expectedReference,
      receivedReference: params.mpPayment.external_reference,
    });
    return { settled: false, reason: "external_reference_mismatch" };
  }

  const { data: expectedPayment } = await admin
    .from("payments")
    .select("amount")
    .eq("order_id", params.orderId)
    .eq("store_id", params.storeId)
    .maybeSingle();

  if (!expectedPayment) {
    console.error("[mercadopago][auditoria] nenhum pagamento gravado pro par pedido/loja — recusado", {
      paymentId: params.mpPayment.id,
      orderId: params.orderId,
      storeId: params.storeId,
    });
    return { settled: false, reason: "payment_not_found" };
  }

  // Tolerância de um centavo: os dois lados já vêm arredondados, a margem é só
  // pra não recusar um pagamento legítimo por ruído de ponto flutuante.
  const paidAmount = params.mpPayment.transaction_amount;
  if (typeof paidAmount !== "number" || Math.abs(round2(paidAmount) - round2(expectedPayment.amount)) > 0.01) {
    console.error("[mercadopago][auditoria] transaction_amount não confere — pagamento recusado", {
      paymentId: params.mpPayment.id,
      orderId: params.orderId,
      storeId: params.storeId,
      expectedAmount: expectedPayment.amount,
      receivedAmount: paidAmount,
    });
    return { settled: false, reason: "amount_mismatch" };
  }

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

  // já estava 'paid' (idempotência) ou sumiu entre a consulta e o update
  if (!updatedPayment) return { settled: false, reason: "already_settled" };

  if (status !== "paid") return { settled: true };

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
  //
  // Best-effort, e por isso dentro de try: o pagamento já foi marcado como pago
  // e a comissão já foi lançada acima, e o que vem depois (fechar o pedido
  // quando todas as lojas pagaram) precisa acontecer mesmo que o frete falhe.
  // As leituras que purchaseLabelForShipment faz antes do try interno dela
  // (incluindo duas chamadas à API admin do Supabase) podem rejeitar por rede;
  // sem esta guarda, o pedido ficava preso em 'pending' para sempre, porque a
  // retentativa do webhook sai por "already_settled" e nunca chega na
  // atualização final.
  try {
    await purchaseLabelForShipment(params.orderId, params.storeId);
  } catch (err) {
    console.error(
      "[shipments][auditoria] logística falhou depois do pagamento confirmado — pedido segue seu curso",
      { orderId: params.orderId, storeId: params.storeId },
      err,
    );
  }

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

  return { settled: true };
}
