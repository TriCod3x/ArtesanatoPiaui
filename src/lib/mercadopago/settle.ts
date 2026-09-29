import { createAdminClient } from "@/lib/supabase/admin";
import { purchaseLabelForShipment } from "@/lib/melhorenvio/purchase";
import { dispatchExpressDelivery } from "@/lib/uber-direct-dispatch";
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
    .select("commission_rate, owner_id")
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

  const { error: confirmError } = await admin
    .from("order_items")
    .update({ item_status: "confirmed" })
    .eq("order_id", params.orderId)
    .eq("store_id", params.storeId);

  // O trigger handle_stock_on_order (banco) lança exceção se não houver
  // estoque suficiente pra confirmar os itens — o supabase-js NUNCA lança
  // nesse caso, só devolve {error}. Sem checar aqui, essa falha passava em
  // silêncio: pagamento já marcado 'paid' e comissão já lançada acima, mas
  // order_items nunca vira 'confirmed' e o pedido fica preso em 'pending'
  // pra sempre (olhando só pra fora, parece que "nunca confirmou"). Não dá
  // pra reverter o pagamento/comissão daqui (reembolso fica fora desta
  // rodada) — o mínimo é não fingir que deu certo: loga, marca o pedido de
  // forma visível e não dispara a logística de um item que não foi
  // confirmado.
  if (confirmError) {
    console.error(
      "[mercadopago][auditoria] pagamento aprovado mas order_items não confirmou — provável falta de estoque no trigger; pedido ficará preso em pending até revisão manual",
      { orderId: params.orderId, storeId: params.storeId, paymentId: params.mpPayment.id, error: confirmError },
    );

    const { data: currentOrder } = await admin
      .from("orders")
      .select("notes")
      .eq("id", params.orderId)
      .maybeSingle();

    const flag = `[ESTOQUE_CONFLITO] loja ${params.storeId} — pagamento ${params.mpPayment.id} aprovado em ${new Date().toISOString()} mas order_items não confirmou (${confirmError.message}). Revisar manualmente.`;

    await admin
      .from("orders")
      .update({ notes: currentOrder?.notes ? `${currentOrder.notes}\n${flag}` : flag })
      .eq("id", params.orderId);

    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
    if (admins && admins.length > 0) {
      await admin.from("notifications").insert(
        admins.map((a) => ({
          user_id: a.id,
          type: "estoque_conflito",
          title: "Pedido precisa de reembolso manual",
          message: `Pedido ${params.orderId.slice(0, 8)} (loja ${params.storeId.slice(0, 8)}) foi pago mas não confirmou por falta de estoque. Revisar e reembolsar manualmente.`,
        })),
      );
    }

    return { settled: true };
  }

  // "Novo pedido pago" pro dono da loja — settlePayment não avisava ninguém
  // da loja quando o pagamento confirmava (só a auditoria de admin, no
  // caminho de erro acima). Try/catch próprio, ANTES da logística: o aviso
  // é sobre o pagamento já confirmado (gravado acima) e não pode depender de
  // a etiqueta ter sido comprada ou a Uber ter aceitado a corrida — se
  // qualquer uma dessas falhar, a artesã ainda precisa saber que tem um
  // pedido pago esperando. Uma notificação por loja por pedido.
  try {
    if (store?.owner_id) {
      await admin.from("notifications").insert({
        user_id: store.owner_id,
        type: "novo_pedido_pago",
        title: "Novo pedido pago",
        message: `Pedido #${params.orderId.slice(0, 8)} foi pago e está pronto pra você preparar o envio.`,
        link: "/minha-loja/pedidos",
      });
    }
  } catch (err) {
    console.error("[shipments][auditoria] falha ao notificar loja de novo pedido pago", {
      orderId: params.orderId,
      storeId: params.storeId,
    }, err);
  }

  // Logística automática assim que ESSA loja é paga — não espera as demais
  // lojas do carrinho (cada uma tem sua própria conta/etiqueta). Qual caminho
  // depende do que o comprador escolheu no checkout: entrega expressa dispara
  // a corrida na Uber Direct, o resto compra etiqueta na Melhor Envio.
  //
  // Este bloco INTEIRO é best-effort e não pode derrubar o resto: o pagamento
  // já foi marcado como pago e a comissão já foi lançada acima, e o que vem
  // depois (fechar o pedido quando todas as lojas pagaram) precisa acontecer
  // mesmo que a logística falhe. Sem este try, um erro de rede aqui deixaria o
  // pedido preso em 'pending' para sempre — a idempotência do settlePayment
  // faz a retentativa do webhook sair por "already_settled" sem nunca chegar
  // na atualização final.
  try {
    const { data: shipmentCarrier } = await admin
      .from("shipments")
      .select("carrier")
      .eq("order_id", params.orderId)
      .eq("store_id", params.storeId)
      .maybeSingle();

    if (shipmentCarrier?.carrier === "uber_direct") {
      await dispatchExpressDelivery(params.orderId, params.storeId);
    } else {
      await purchaseLabelForShipment(params.orderId, params.storeId);
    }
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
