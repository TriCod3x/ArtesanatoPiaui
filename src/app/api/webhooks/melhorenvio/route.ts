import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature, mapShipmentStatus } from "@/lib/melhorenvio/client";

interface MEWebhookPayload {
  event?: string;
  data?: {
    id?: string;
    status?: string;
    tracking?: string | null;
    melhorenvio_tracking?: string | null;
  };
}

/**
 * Webhook da Melhor Envio. Atualizações de status (postado, em trânsito,
 * entregue) chegam aqui — `data.id` é o id do item no carrinho da Melhor
 * Envio, que gravamos em shipments.melhorenvio_cart_id ao comprar a etiqueta.
 */
// Algumas integrações fazem um ping de alcançabilidade (GET) ao salvar a URL
// do webhook no painel — responde 200 pra não confundir com "rota inexistente".
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let valid: boolean;
  try {
    valid = verifyWebhookSignature(rawBody, request.headers.get("x-me-signature"));
  } catch (err) {
    // MELHORENVIO_WEBHOOK_SECRET ainda não configurada (só existe depois de
    // cadastrar o webhook no painel) — loga em vez de derrubar a requisição.
    console.error("[melhorenvio] verifyWebhookSignature falhou:", err);
    valid = false;
  }
  if (!valid) {
    console.warn("[melhorenvio] webhook com assinatura inválida ou secret não configurada");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: MEWebhookPayload = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true });
  }

  const cartId = payload.data?.id;
  if (!cartId) return NextResponse.json({ received: true });

  try {
    const admin = createAdminClient();
    const { data: shipment } = await admin
      .from("shipments")
      .select("id, status")
      .eq("melhorenvio_cart_id", cartId)
      .maybeSingle();

    if (!shipment) {
      console.warn("[melhorenvio] webhook pra um cart_id desconhecido", { cartId });
      return NextResponse.json({ received: true });
    }

    const meStatus = payload.data?.status ?? payload.event?.replace(/^order\./, "") ?? "";
    const status = mapShipmentStatus(meStatus);
    const tracking = payload.data?.tracking ?? payload.data?.melhorenvio_tracking ?? null;

    await admin
      .from("shipments")
      .update({
        status,
        ...(tracking ? { tracking_code: tracking } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipment.id);

    if (status === "delivered") {
      const { data: fullShipment } = await admin
        .from("shipments")
        .select("order_id, store_id")
        .eq("id", shipment.id)
        .single();
      if (fullShipment) {
        await admin
          .from("order_items")
          .update({ item_status: "delivered" })
          .eq("order_id", fullShipment.order_id)
          .eq("store_id", fullShipment.store_id);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[melhorenvio] falha ao processar webhook:", err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
