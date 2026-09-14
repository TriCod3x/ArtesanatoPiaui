"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPixPayment,
  createCardPreference,
  getPayment,
} from "@/lib/mercadopago/client";
import { settlePayment } from "@/lib/mercadopago/settle";
import type { PaymentMethod, StorePaymentResult } from "@/types";
import type { Json } from "@/types/database";
import type { User } from "@supabase/supabase-js";

interface StoreGroup {
  storeId: string;
  storeName: string;
  commissionRate: number;
  mpAccessToken: string | null;
  items: { title: string; quantity: number; unitPrice: number }[];
  amount: number;
}

async function loadStoreGroups(orderId: string): Promise<StoreGroup[] | null> {
  const admin = createAdminClient();

  const { data: items } = await admin
    .from("order_items")
    .select("store_id, quantity, unit_price, subtotal, product:products(name), store:stores(name, commission_rate, mp_access_token, mp_connected_at)")
    .eq("order_id", orderId);

  if (!items || items.length === 0) return null;

  const groups = new Map<string, StoreGroup>();
  for (const item of items) {
    const store = item.store as unknown as {
      name: string;
      commission_rate: number;
      mp_access_token: string | null;
      mp_connected_at: string | null;
    };
    const product = item.product as unknown as { name: string } | null;

    if (!groups.has(item.store_id)) {
      groups.set(item.store_id, {
        storeId: item.store_id,
        storeName: store.name,
        commissionRate: store.commission_rate,
        mpAccessToken: store.mp_connected_at ? store.mp_access_token : null,
        items: [],
        amount: 0,
      });
    }
    const group = groups.get(item.store_id)!;
    group.items.push({
      title: product?.name ?? "Produto",
      quantity: item.quantity,
      unitPrice: item.unit_price,
    });
    group.amount += item.subtotal;
  }

  return Array.from(groups.values());
}

async function assertOwnPendingOrder(
  orderId: string,
): Promise<{ error: string } | { user: User; order: { id: string; status: string } }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." as const };

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("buyer_id", user.id)
    .maybeSingle();

  if (!order) return { error: "Pedido não encontrado." as const };
  return { user, order };
}

/**
 * Cria um pagamento (Pix) ou preference (cartão) POR LOJA do pedido — no
 * split 1:1 não existe "um pagamento com vários recebedores": cada loja tem
 * sua própria conta Mercado Pago, então cada uma vira uma chamada separada
 * autenticada com o access_token dela. Lojas sem Mercado Pago conectado são
 * bloqueadas com uma mensagem, sem impedir as demais.
 */
export async function createPayment(
  orderId: string,
  method: PaymentMethod,
): Promise<{ error: string } | { success: true; payments: StorePaymentResult[] }> {
  const ctx = await assertOwnPendingOrder(orderId);
  if ("error" in ctx) return { error: ctx.error };
  const { user } = ctx;

  const groups = await loadStoreGroups(orderId);
  if (!groups) return { error: "Pedido sem itens." };

  const admin = createAdminClient();
  const results: StorePaymentResult[] = [];

  for (const group of groups) {
    if (!group.mpAccessToken) {
      results.push({
        storeId: group.storeId,
        storeName: group.storeName,
        method,
        status: "pending",
        amount: group.amount,
        error: `${group.storeName} ainda não conectou o Mercado Pago e não pode receber pagamentos no momento.`,
      });
      continue;
    }

    const fee = Math.round(group.amount * (group.commissionRate / 100) * 100) / 100;

    try {
      if (method === "pix") {
        const payment = await createPixPayment({
          sellerAccessToken: group.mpAccessToken,
          amount: group.amount,
          description: `Pedido ${orderId.slice(0, 8)} — ${group.storeName}`,
          applicationFee: fee,
          payerEmail: user.email!,
          orderId,
          storeId: group.storeId,
        });

        const qr = payment.point_of_interaction?.transaction_data;
        await admin.from("payments").upsert(
          {
            order_id: orderId,
            store_id: group.storeId,
            provider: "mercadopago",
            method: "pix",
            amount: group.amount,
            status: "pending",
            external_id: String(payment.id),
            pix_qr_code: qr?.qr_code ?? null,
            // guarda o base64 do QR (não é uma URL — o nome da coluna é genérico)
            pix_qr_code_url: qr?.qr_code_base64 ?? null,
            pix_expires_at: payment.date_of_expiration,
            checkout_url: null,
            raw_payload: payment as unknown as Json,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "order_id,store_id" },
        );

        results.push({
          storeId: group.storeId,
          storeName: group.storeName,
          method,
          status: "pending",
          amount: group.amount,
          paymentId: String(payment.id),
          pixQrCode: qr?.qr_code,
          pixQrCodeBase64: qr?.qr_code_base64,
          pixExpiresAt: payment.date_of_expiration,
        });
      } else {
        const preference = await createCardPreference({
          sellerAccessToken: group.mpAccessToken,
          items: group.items,
          marketplaceFee: fee,
          orderId,
          storeId: group.storeId,
          payerEmail: user.email!,
        });

        await admin.from("payments").upsert(
          {
            order_id: orderId,
            store_id: group.storeId,
            provider: "mercadopago",
            method: "credit_card",
            amount: group.amount,
            status: "pending",
            external_id: preference.id,
            checkout_url: preference.init_point,
            raw_payload: preference as unknown as Json,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "order_id,store_id" },
        );

        results.push({
          storeId: group.storeId,
          storeName: group.storeName,
          method,
          status: "pending",
          amount: group.amount,
          paymentId: preference.id,
          checkoutUrl: preference.init_point,
        });
      }
    } catch (err) {
      results.push({
        storeId: group.storeId,
        storeName: group.storeName,
        method,
        status: "pending",
        amount: group.amount,
        error: `Erro ao gerar pagamento para ${group.storeName}. Tente novamente.`,
      });
      console.error(`[mercadopago] createPayment falhou para store ${group.storeId}:`, err);
    }
  }

  return { success: true, payments: results };
}

/** Lê os pagamentos já criados pro pedido (pra recarregar a tela sem perder estado). */
export async function getOrderPaymentStatus(orderId: string): Promise<StorePaymentResult[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // A policy payments_select_own já restringe a leitura ao dono do pedido (ou admin).
  const { data } = await supabase
    .from("payments")
    .select("store_id, method, status, amount, external_id, pix_qr_code, pix_qr_code_url, pix_expires_at, checkout_url, store:stores(name)")
    .eq("order_id", orderId);

  if (!data) return [];

  return data.map((p) => ({
    storeId: p.store_id!,
    storeName: (p.store as unknown as { name: string })?.name ?? "Loja",
    method: p.method as PaymentMethod,
    status: p.status as StorePaymentResult["status"],
    amount: p.amount,
    paymentId: p.external_id ?? undefined,
    pixQrCode: p.pix_qr_code,
    pixQrCodeBase64: p.pix_qr_code_url,
    pixExpiresAt: p.pix_expires_at,
    checkoutUrl: p.checkout_url,
  }));
}

/** Botão "verificar status" (Pix) — consulta a Mercado Pago e sincroniza o banco. */
export async function checkPaymentStatus(orderId: string, storeId: string) {
  const ctx = await assertOwnPendingOrder(orderId);
  if ("error" in ctx) return { error: ctx.error };

  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("external_id, status")
    .eq("order_id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!payment?.external_id) return { error: "Pagamento não encontrado." };
  if (payment.status === "paid") return { success: true, status: "paid" as const };

  const { data: store } = await admin
    .from("stores")
    .select("mp_access_token, mp_connected_at")
    .eq("id", storeId)
    .single();

  if (!store?.mp_connected_at || !store.mp_access_token) {
    return { error: "Loja não conectada ao Mercado Pago." };
  }

  const mpPayment = await getPayment(store.mp_access_token, payment.external_id);
  await settlePayment({ orderId, storeId, mpPayment });

  const { data: updated } = await admin
    .from("payments")
    .select("status")
    .eq("order_id", orderId)
    .eq("store_id", storeId)
    .single();

  return { success: true, status: updated?.status ?? payment.status };
}
