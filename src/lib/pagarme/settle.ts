import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Efetiva um pedido pago: idempotente, seguro para ser chamado tanto pelo
 * webhook quanto pela verificação manual de status.
 *
 * - `payments.status`   → 'paid'
 * - `orders.status`     → 'confirmed'
 * - `order_items.item_status` → 'confirmed' (dispara o trigger de baixa de estoque)
 * - cria uma linha em `commissions` por item (idempotente por `order_item_id`)
 */
export async function settlePaidOrder(
  orderId: string,
  rawPayload?: unknown,
): Promise<{ settled: boolean }> {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { settled: false };

  // Pagamento → paid
  await admin
    .from("payments")
    .update({
      status: "paid",
      ...(rawPayload ? { raw_payload: rawPayload as never } : {}),
    })
    .eq("order_id", orderId)
    .neq("status", "paid");

  if (order.status === "confirmed") {
    // já efetivado — garante só que as comissões existem e sai
    await ensureCommissions(admin, orderId);
    return { settled: true };
  }

  await admin.from("orders").update({ status: "confirmed" }).eq("id", orderId);

  // pending → confirmed (dispara trigger de estoque item a item)
  await admin
    .from("order_items")
    .update({ item_status: "confirmed" })
    .eq("order_id", orderId)
    .eq("item_status", "pending");

  await ensureCommissions(admin, orderId);

  return { settled: true };
}

async function ensureCommissions(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
) {
  const { data: items } = await admin
    .from("order_items")
    .select("id, store_id, subtotal, stores(commission_rate)")
    .eq("order_id", orderId);

  if (!items || items.length === 0) return;

  const { data: existing } = await admin
    .from("commissions")
    .select("order_item_id")
    .in(
      "order_item_id",
      items.map((i) => i.id),
    );

  const done = new Set((existing ?? []).map((c) => c.order_item_id));

  const toInsert = items
    .filter((i) => !done.has(i.id))
    .map((i) => {
      const store = Array.isArray(i.stores) ? i.stores[0] : i.stores;
      const rate = Number(store?.commission_rate ?? 10);
      const gross = Number(i.subtotal);
      const commission = Number(((gross * rate) / 100).toFixed(2));
      const net = Number((gross - commission).toFixed(2));
      return {
        order_item_id: i.id,
        store_id: i.store_id,
        gross_amount: gross,
        commission_rate: rate,
        commission_amount: commission,
        net_amount: net,
        status: "paid" as const,
        paid_at: new Date().toISOString(),
      };
    });

  if (toInsert.length > 0) {
    await admin.from("commissions").insert(toInsert);
  }
}

/** Marca o pagamento de um pedido como falho. */
export async function markPaymentFailed(
  orderId: string,
  rawPayload?: unknown,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("payments")
    .update({
      status: "failed",
      ...(rawPayload ? { raw_payload: rawPayload as never } : {}),
    })
    .eq("order_id", orderId)
    .not("status", "in", "(paid,refunded)");
}
