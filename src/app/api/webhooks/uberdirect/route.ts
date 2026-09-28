import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature, mapDeliveryStatus } from "@/lib/uber-direct";

/**
 * Webhook da Uber Direct (evento `event.delivery_status`). O `delivery_id` do
 * payload e o que gravamos em shipments.uber_delivery_id quando a entrega foi
 * criada (ver dispatchExpressDelivery).
 *
 * Mesmo padrao dos webhooks do Mercado Pago e da Melhor Envio: assinatura
 * HMAC-SHA256 do corpo bruto, fail-closed, e resposta generica — nada de
 * detalhe interno no corpo da resposta, so no log.
 */
interface UberWebhookPayload {
  kind?: string;
  delivery_id?: string;
  status?: string;
  data?: {
    tracking_url?: string;
    courier?: { name?: string; phone_number?: string };
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // x-uber-signature e o header atual; x-postmates-signature e o nome herdado
  // da Postmates, ainda enviado em integracoes antigas. Aceita os dois.
  const signature =
    request.headers.get("x-uber-signature") ?? request.headers.get("x-postmates-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[uber-direct] webhook com assinatura invalida ou secret nao configurada");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: UberWebhookPayload = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true });
  }

  // Outros tipos de evento (refund, courier update) so confirmam o recebimento.
  if (payload.kind && payload.kind !== "event.delivery_status") {
    return NextResponse.json({ received: true });
  }

  const deliveryId = payload.delivery_id;
  const uberStatus = payload.status;
  if (!deliveryId || !uberStatus) return NextResponse.json({ received: true });

  try {
    const admin = createAdminClient();

    const { data: shipment } = await admin
      .from("shipments")
      .select("id, order_id, store_id")
      .eq("uber_delivery_id", deliveryId)
      .maybeSingle();

    if (!shipment) {
      console.warn("[uber-direct] webhook para um delivery_id desconhecido", { deliveryId });
      return NextResponse.json({ received: true });
    }

    const status = mapDeliveryStatus(uberStatus);
    const trackingUrl = payload.data?.tracking_url ?? null;

    await admin
      .from("shipments")
      .update({
        status,
        uber_delivery_status: uberStatus,
        ...(trackingUrl ? { uber_tracking_url: trackingUrl } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipment.id);

    // Mesma regra do webhook da Melhor Envio: entrega concluida fecha os itens
    // daquela loja no pedido.
    if (status === "delivered") {
      await admin
        .from("order_items")
        .update({ item_status: "delivered" })
        .eq("order_id", shipment.order_id)
        .eq("store_id", shipment.store_id);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[uber-direct] falha ao processar webhook:", err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
