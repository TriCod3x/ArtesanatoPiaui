import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment, verifyWebhookSignature } from "@/lib/mercadopago/client";
import { settlePayment } from "@/lib/mercadopago/settle";

/**
 * Webhook da Mercado Pago. `order_id`/`store_id` vêm na própria URL (foi
 * assim que cada pagamento/preference foi criado, um notification_url por
 * loja — ver webhookUrl() em lib/mercadopago/client.ts), o que evita ter que
 * adivinhar qual conta MP consultar: usamos direto o mp_access_token dessa
 * store pra buscar o pagamento em /v1/payments/{id}.
 */
export async function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const orderId = searchParams.get("order_id");
  const storeId = searchParams.get("store_id");

  let body: { type?: string; action?: string; data?: { id?: string } } = {};
  try {
    body = await request.json();
  } catch {
    // notificações de teste do painel MP às vezes vêm sem corpo
  }

  const dataId = searchParams.get("data.id") ?? body.data?.id ?? null;
  const type = body.type ?? searchParams.get("type");

  const validSignature = verifyWebhookSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId: dataId ?? "",
  });

  if (!validSignature) {
    console.warn("[mercadopago] webhook com assinatura inválida", { orderId, storeId, dataId });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (type !== "payment" || !dataId || !orderId || !storeId) {
    // outros tipos de evento (merchant_order, application deauth, etc.) — só confirma o recebimento
    return NextResponse.json({ received: true });
  }

  try {
    const admin = createAdminClient();
    const { data: store } = await admin
      .from("stores")
      .select("mp_access_token")
      .eq("id", storeId)
      .maybeSingle();

    if (!store?.mp_access_token) {
      console.error("[mercadopago] webhook pra loja sem token conectado", { storeId });
      return NextResponse.json({ error: "store not connected" }, { status: 200 });
    }

    const mpPayment = await getPayment(store.mp_access_token, dataId);
    await settlePayment({ orderId, storeId, mpPayment });

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[mercadopago] falha ao processar webhook:", err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
