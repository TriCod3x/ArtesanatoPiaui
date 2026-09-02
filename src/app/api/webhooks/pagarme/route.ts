import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { settlePaidOrder, markPaymentFailed } from "@/lib/pagarme/settle";

// Webhook sempre dinâmico e no runtime Node (usa `node:crypto` + service role).
export const dynamic = "force-dynamic";

/**
 * Valida a autenticidade do webhook.
 *
 * O Pagar.me v5 não assina o corpo com HMAC — a autenticidade é garantida
 * configurando credenciais de Basic Auth no endpoint do webhook (dashboard).
 * `PAGARME_WEBHOOK_SECRET` deve conter exatamente a string `usuario:senha`
 * cadastrada lá. Como fallback aceitamos `?secret=` na URL do endpoint.
 */
function isAuthentic(req: NextRequest): boolean {
  const expected = process.env.PAGARME_WEBHOOK_SECRET;
  if (!expected) return false;

  const safeEqual = (a: string, b: string) => {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  };

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    if (safeEqual(decoded, expected)) return true;
  }

  const querySecret = req.nextUrl.searchParams.get("secret");
  if (querySecret && safeEqual(querySecret, expected)) return true;

  return false;
}

interface PagarmeWebhookBody {
  id?: string;
  type?: string;
  data?: {
    id?: string;
    code?: string;
    status?: string;
    order?: { id?: string; code?: string };
  };
}

export async function POST(req: NextRequest) {
  if (!isAuthentic(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: PagarmeWebhookBody;
  try {
    body = (await req.json()) as PagarmeWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const event = body.type ?? "";
  // `code` = id do nosso pedido (definido em createPayment como `code: order.id`)
  const orderCode = body.data?.code ?? body.data?.order?.code ?? null;

  if (!orderCode) {
    return NextResponse.json({ received: true, ignored: "sem order code" });
  }

  try {
    switch (event) {
      case "order.paid":
      case "charge.paid":
        await settlePaidOrder(orderCode, body);
        break;
      case "order.payment_failed":
      case "charge.payment_failed":
        await markPaymentFailed(orderCode, body);
        break;
      default:
        // outros eventos (order.created, charge.pending, etc.) — nada a fazer
        break;
    }
  } catch (err) {
    console.error("[webhook pagarme] erro ao processar", event, err);
    return NextResponse.json({ error: "processing error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
