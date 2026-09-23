import { createHmac, timingSafeEqual } from "crypto";

const API_BASE = "https://api.mercadopago.com";
const AUTH_BASE = "https://auth.mercadopago.com";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada.`);
  return value;
}

function appUrl(): string {
  return env("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
}

export function callbackUrl(): string {
  return `${appUrl()}/api/mercadopago/callback`;
}

export function webhookUrl(orderId: string, storeId: string): string {
  const url = new URL(`${appUrl()}/api/webhooks/mercadopago`);
  url.searchParams.set("order_id", orderId);
  url.searchParams.set("store_id", storeId);
  return url.toString();
}

// ── OAuth (cada loja conecta a própria conta Mercado Pago) ─────────────────

const STATE_TTL_MS = 10 * 60 * 1000; // mesma janela de validade do `code` da MP

/** Assina `storeId` num state opaco (HMAC), pra evitar CSRF/adulteração no callback. */
export function signOAuthState(storeId: string): string {
  const payload = `${storeId}.${Date.now() + STATE_TTL_MS}`;
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const hmac = createHmac("sha256", env("MERCADOPAGO_CLIENT_SECRET"))
    .update(payloadB64)
    .digest("hex");
  return `${payloadB64}.${hmac}`;
}

/** Valida o state recebido no callback e retorna o storeId, ou null se inválido/expirado. */
export function verifyOAuthState(state: string): string | null {
  const [payloadB64, hmac] = state.split(".");
  if (!payloadB64 || !hmac) return null;

  const expected = createHmac("sha256", env("MERCADOPAGO_CLIENT_SECRET"))
    .update(payloadB64)
    .digest("hex");

  const a = Buffer.from(hmac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [storeId, expiresAtRaw] = Buffer.from(payloadB64, "base64url")
    .toString()
    .split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!storeId || !expiresAt || Date.now() > expiresAt) return null;

  return storeId;
}

export function buildAuthorizationUrl(storeId: string): string {
  const url = new URL("/authorization", AUTH_BASE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env("MERCADOPAGO_CLIENT_ID"));
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("state", signOAuthState(storeId));
  return url.toString();
}

export interface MPOAuthToken {
  access_token: string;
  refresh_token: string;
  user_id: number;
  public_key: string;
  live_mode: boolean;
}

export async function exchangeOAuthCode(code: string): Promise<MPOAuthToken> {
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env("MERCADOPAGO_CLIENT_ID"),
      client_secret: env("MERCADOPAGO_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao trocar o code por token (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ── Pix (Payments API — Checkout Transparente, application_fee) ────────────

export interface CreatePixPaymentInput {
  sellerAccessToken: string;
  amount: number;
  description: string;
  applicationFee: number;
  payerEmail: string;
  payerCpf: string;
  orderId: string;
  storeId: string;
}

export interface MPPixPayment {
  id: number;
  status: string;
  date_of_expiration: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
}

export async function createPixPayment(input: CreatePixPaymentInput): Promise<MPPixPayment> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const res = await fetch(`${API_BASE}/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.sellerAccessToken}`,
      "X-Idempotency-Key": `${input.orderId}:${input.storeId}`,
    },
    body: JSON.stringify({
      transaction_amount: round2(input.amount),
      description: input.description,
      payment_method_id: "pix",
      payer: {
        email: input.payerEmail,
        identification: { type: "CPF", number: input.payerCpf },
      },
      application_fee: round2(input.applicationFee),
      notification_url: webhookUrl(input.orderId, input.storeId),
      external_reference: `${input.orderId}:${input.storeId}`,
      date_of_expiration: expiresAt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao criar pagamento Pix (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ── Cartão (Preferences API — Checkout Pro, marketplace_fee) ───────────────

export interface CreateCardPreferenceInput {
  sellerAccessToken: string;
  items: { title: string; quantity: number; unitPrice: number }[];
  marketplaceFee: number;
  orderId: string;
  storeId: string;
  payerEmail: string;
}

export interface MPPreference {
  id: string;
  init_point: string;
  sandbox_init_point: string;
}

export async function createCardPreference(input: CreateCardPreferenceInput): Promise<MPPreference> {
  const res = await fetch(`${API_BASE}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.sellerAccessToken}`,
    },
    body: JSON.stringify({
      items: input.items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        unit_price: round2(item.unitPrice),
        currency_id: "BRL",
      })),
      payer: { email: input.payerEmail },
      marketplace_fee: round2(input.marketplaceFee),
      external_reference: `${input.orderId}:${input.storeId}`,
      notification_url: webhookUrl(input.orderId, input.storeId),
      back_urls: {
        success: `${appUrl()}/checkout?order=${input.orderId}`,
        pending: `${appUrl()}/checkout?order=${input.orderId}`,
        failure: `${appUrl()}/checkout?order=${input.orderId}`,
      },
      auto_return: "approved",
      // Cartão-only: Pix já é oferecido pela nossa própria tela via /v1/payments.
      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }, { id: "bank_transfer" }, { id: "atm" }],
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao criar preferência de pagamento (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ── Consulta de status (usada pelo webhook e pelo botão "verificar status") ─

export interface MPPayment {
  id: number;
  status: "pending" | "approved" | "authorized" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back";
  external_reference: string | null;
  /** Valor efetivamente cobrado — conferido contra o pedido em settlePayment(). */
  transaction_amount: number | null;
}

export async function getPayment(sellerAccessToken: string, paymentId: string): Promise<MPPayment> {
  const res = await fetch(`${API_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${sellerAccessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Falha ao consultar pagamento (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ── Webhook signature (x-signature / x-request-id, HMAC-SHA256) ────────────

export interface WebhookSignatureInput {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
}

/**
 * Janela de frescor do `ts` assinado. Sem ela, uma notificação capturada
 * continua com assinatura válida pra sempre e pode ser reenviada à vontade.
 */
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

/** `ts` chega em segundos ou milissegundos dependendo do evento. */
function signatureTimestampMs(ts: string): number | null {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 1e12 ? value : value * 1000;
}

export function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
  if (!input.xSignature || !input.xRequestId) return false;

  const parts = Object.fromEntries(
    input.xSignature.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    }),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const tsMs = signatureTimestampMs(ts);
  if (tsMs === null || Math.abs(Date.now() - tsMs) > SIGNATURE_MAX_AGE_MS) {
    console.warn("[mercadopago][auditoria] assinatura fora da janela de frescor — recusada", {
      dataId: input.dataId,
      ts,
    });
    return false;
  }

  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.xRequestId};ts:${ts};`;
  const expected = createHmac("sha256", env("MERCADOPAGO_WEBHOOK_SECRET"))
    .update(manifest)
    .digest("hex");

  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
