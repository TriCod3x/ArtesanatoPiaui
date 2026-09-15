import { NextRequest, NextResponse } from "next/server";
import { getPayment, verifyWebhookSignature } from "@/lib/mercadopago/client";
import { settlePayment } from "@/lib/mercadopago/settle";
import { getStoreCredential } from "@/lib/store-credentials";

/**
 * Webhook da Mercado Pago. `order_id`/`store_id` vêm na própria URL (foi
 * assim que cada pagamento/preference foi criado, um notification_url por
 * loja — ver webhookUrl() em lib/mercadopago/client.ts), o que evita ter que
 * adivinhar qual conta MP consultar: buscamos o token dessa store em
 * store_integration_credentials pra consultar o pagamento em /v1/payments/{id}.
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
    const credential = await getStoreCredential(storeId, "mercadopago");

    if (!credential) {
      console.error("[mercadopago] webhook pra loja sem token conectado", { storeId });
      return NextResponse.json({ error: "store not connected" }, { status: 200 });
    }

    const mpPayment = await getPayment(credential.accessToken, dataId);
    await settlePayment({ orderId, storeId, mpPayment });

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[mercadopago] falha ao processar webhook:", err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
