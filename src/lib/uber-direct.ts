// Integração com a Uber Direct: cotação (getDeliveryQuote), criação da entrega
// (createDelivery) e validação do webhook de status. A cotação também é usada
// pela rota de teste manual em src/app/api/dev/uber-direct-quote.

import { createHmac, timingSafeEqual } from "node:crypto";

const OAUTH_URL = "https://login.uber.com/oauth/v2/token";
const API_BASE = "https://api.uber.com";
const OAUTH_SCOPE = "eats.deliveries";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada.`);
  return value;
}

export interface UberDirectAddress {
  street_address: string[];
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

export interface DeliveryQuote {
  /** quote_id — obrigatório pra criar a entrega depois (createDelivery). */
  id: string | null;
  // ATENÇÃO: a Uber Direct retorna `fee` em CENTAVOS da moeda de `currency`
  // (ex.: fee=1620 + currency="brl" = R$16,20), não em unidade cheia. Ao
  // integrar isso no checkout de verdade, dividir por 100 antes de exibir
  // ou somar com outros valores em reais (frete Melhor Envio, total do
  // pedido etc., que já estão em unidade cheia). Ainda não convertido aqui
  // porque esta lib é só pra cotação de teste manual.
  fee: number;
  currency: string;
  dropoffEta: string | null;
  raw: unknown;
}

export class UberDirectError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "UberDirectError";
  }
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// Token em memória do processo — reinicia a cada deploy/cold start, o que é
// suficiente pra uma rota de teste manual (não é usado em produção real).
let cachedToken: CachedToken | null = null;

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export async function getAccessToken(): Promise<string> {
  // Margem de 60s pra não usar um token que expira no meio da requisição.
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.accessToken;
  }

  const clientId = env("UBER_DIRECT_CLIENT_ID");
  const clientSecret = env("UBER_DIRECT_CLIENT_SECRET");

  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: OAUTH_SCOPE,
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new UberDirectError(
      `Falha ao autenticar com a Uber Direct (${res.status}): ${rawText}`,
      res.status,
    );
  }

  const data = JSON.parse(rawText) as OAuthTokenResponse;
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

export async function getDeliveryQuote(
  pickupAddress: UberDirectAddress,
  dropoffAddress: UberDirectAddress,
): Promise<DeliveryQuote> {
  const customerId = env("UBER_DIRECT_CUSTOMER_ID");
  const accessToken = await getAccessToken();

  const res = await fetch(`${API_BASE}/v1/customers/${customerId}/delivery_quotes`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      pickup_address: JSON.stringify(pickupAddress),
      dropoff_address: JSON.stringify(dropoffAddress),
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    // Formato de erro da Uber costuma ser { code, message }. Extrai a
    // mensagem quando dá, senão cai pro corpo bruto — em ambos os casos o
    // status HTTP já indica a natureza do problema (401 = auth, 4xx = coverage/validação).
    let message = rawText;
    try {
      const parsed = JSON.parse(rawText) as { message?: string; code?: string };
      message = parsed.message ?? parsed.code ?? rawText;
    } catch {
      // corpo não é JSON — mantém o texto bruto
    }
    throw new UberDirectError(`Falha ao cotar entrega na Uber Direct (${res.status}): ${message}`, res.status);
  }

  const data = JSON.parse(rawText) as {
    id?: string;
    fee?: number;
    currency?: string;
    dropoff_eta?: string;
  };

  if (typeof data.fee !== "number" || !data.currency) {
    throw new UberDirectError("Resposta da Uber Direct sem valor de taxa (fee) — provável endereço fora de cobertura.");
  }

  return {
    id: data.id ?? null,
    fee: data.fee, // centavos — ver comentário em DeliveryQuote.fee
    currency: data.currency,
    dropoffEta: data.dropoff_eta ?? null,
    raw: data,
  };
}

// ── Criação da entrega (POST /v1/customers/{id}/deliveries) ────────────────

export interface DeliveryContactInfo {
  pickupName: string;
  pickupPhone: string;
  dropoffName: string;
  dropoffPhone: string;
  dropoffNotes?: string;
}

export interface DeliveryManifestItem {
  name: string;
  quantity: number;
  /** Valor unitário em CENTAVOS (a Uber trabalha em centavos, como no fee). */
  priceCents?: number;
}

export interface CreatedDelivery {
  id: string;
  status: string;
  trackingUrl: string | null;
  /** Centavos — mesma unidade do fee da cotação. */
  fee: number | null;
  currency: string | null;
  /** Resposta crua da Uber, como em DeliveryQuote.raw — usada pela rota de teste. */
  raw: unknown;
}

/**
 * Cria a entrega de fato, a partir de um quote_id já obtido em
 * getDeliveryQuote(). A cotação tem validade curta do lado da Uber: se o
 * quote_id expirou, a API recusa e cai no fallback de quem chamou.
 *
 * Diferente do quote, aqui os endereços vão junto com nome e telefone de quem
 * entrega e de quem recebe — é com esses dados que o entregador se orienta.
 */
export async function createDelivery(
  quoteId: string,
  pickupAddress: UberDirectAddress,
  dropoffAddress: UberDirectAddress,
  recipientInfo: DeliveryContactInfo,
  orderItemInfo: DeliveryManifestItem[],
  externalId?: string,
  /**
   * Valor total declarado da carga, em CENTAVOS. Omitido, a Uber registra a
   * entrega com manifest.total_value = 0 — confirmado no sandbox: o `price` de
   * cada item NÃO alimenta o total sozinho.
   */
  manifestTotalValueCents?: number,
): Promise<CreatedDelivery> {
  const customerId = env("UBER_DIRECT_CUSTOMER_ID");
  const accessToken = await getAccessToken();

  const res = await fetch(`${API_BASE}/v1/customers/${customerId}/deliveries`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      quote_id: quoteId,
      pickup_address: JSON.stringify(pickupAddress),
      pickup_name: recipientInfo.pickupName,
      pickup_phone_number: recipientInfo.pickupPhone,
      dropoff_address: JSON.stringify(dropoffAddress),
      dropoff_name: recipientInfo.dropoffName,
      dropoff_phone_number: recipientInfo.dropoffPhone,
      ...(recipientInfo.dropoffNotes ? { dropoff_notes: recipientInfo.dropoffNotes } : {}),
      manifest_items: orderItemInfo.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        size: "small",
        ...(item.priceCents !== undefined ? { price: item.priceCents } : {}),
      })),
      ...(externalId ? { external_id: externalId } : {}),
      ...(manifestTotalValueCents !== undefined
        ? { manifest_total_value: manifestTotalValueCents }
        : {}),
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    let message = rawText;
    try {
      const parsed = JSON.parse(rawText) as { message?: string; code?: string };
      message = parsed.message ?? parsed.code ?? rawText;
    } catch {
      // corpo não é JSON — mantém o texto bruto
    }
    throw new UberDirectError(`Falha ao criar entrega na Uber Direct (${res.status}): ${message}`, res.status);
  }

  const data = JSON.parse(rawText) as {
    id?: string;
    status?: string;
    tracking_url?: string;
    fee?: number;
    currency?: string;
  };

  if (!data.id) {
    throw new UberDirectError("Resposta da Uber Direct sem id da entrega.");
  }

  return {
    id: data.id,
    status: data.status ?? "pending",
    trackingUrl: data.tracking_url ?? null,
    fee: typeof data.fee === "number" ? data.fee : null,
    currency: data.currency ?? null,
    raw: data,
  };
}

// ── Webhook (event.delivery_status) ────────────────────────────────────────

/**
 * Valida a assinatura do webhook da Uber Direct. Mesmo padrão já usado pro
 * Mercado Pago e pra Melhor Envio: HMAC-SHA256 do corpo BRUTO com a chave de
 * assinatura, comparação em tempo constante e fail-closed (sem header ou sem
 * secret configurado = recusa).
 *
 * A chave NÃO é o UBER_DIRECT_CLIENT_SECRET: a Uber Direct gera uma Signing
 * Key própria por endpoint de webhook (formato UUID), visível só na tela de
 * edição do endpoint no painel. Por isso UBER_DIRECT_WEBHOOK_SECRET é uma
 * variável separada — diferente da Melhor Envio, que reaproveita o client
 * secret da aplicação.
 *
 * A assinatura chega em `x-uber-signature` (ou `x-postmates-signature`, nome
 * herdado da Postmates, em integrações antigas).
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const secret = process.env.UBER_DIRECT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[uber-direct] UBER_DIRECT_WEBHOOK_SECRET não configurada — webhook recusado.");
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(signature.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Traduz o status da Uber Direct pro enum de shipments.status.
 *
 * Estados da Uber (doc "Delivery Status Webhook"): pending (aceita, sem
 * entregador), pickup (entregador a caminho da loja), pickup_complete
 * (coletado), dropoff (a caminho do comprador), delivered, canceled, returned
 * (cancelada com devolução) e shopping_completed (não se aplica aqui).
 */
export function mapDeliveryStatus(
  uberStatus: string,
): "pending" | "purchased" | "posted" | "in_transit" | "delivered" | "cancelled" {
  switch (uberStatus) {
    case "pending":
    case "pickup":
      return "purchased";
    case "pickup_complete":
      return "posted";
    case "dropoff":
      return "in_transit";
    case "delivered":
      return "delivered";
    case "canceled":
    case "returned":
      return "cancelled";
    default:
      return "purchased";
  }
}
