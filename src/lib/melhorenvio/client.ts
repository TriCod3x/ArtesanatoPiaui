import { createHmac, timingSafeEqual } from "crypto";

// User-Agent é obrigatório em toda chamada (doc oficial) — identifica a
// aplicação e um contato técnico. Ajuste o e-mail pro contato real de suporte.
const USER_AGENT = "Artesanatos Piaui (suporte@artesanatospiaui.com.br)";

// cart-write (adicionar ao carrinho), shipping-calculate (cotação),
// shipping-checkout (pagar/comprar a etiqueta), shipping-generate (gerar a
// etiqueta), shipping-tracking (consultar status/código de rastreio) — só os
// scopes que esta integração realmente usa.
const SCOPES = "cart-write shipping-calculate shipping-checkout shipping-generate shipping-tracking";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada.`);
  return value;
}

/**
 * client_id é um número simples (ex.: "12011") — nunca contém "=" nem o
 * nome de outra variável. Isso pega o erro clássico de configuração: colar
 * a linha inteira "MELHORENVIO_CLIENT_SECRET=xxxx" (nome da var + valor) no
 * campo de VALOR de MELHORENVIO_CLIENT_ID no painel de deploy (Vercel), em
 * vez de só o número. Falha alto e claro em vez de montar uma URL OAuth
 * quebrada que a Melhor Envio rejeita com invalid_client sem dizer por quê.
 */
function clientId(): string {
  const value = env("MELHORENVIO_CLIENT_ID").trim();
  if (value.includes("=") || /\s/.test(value) || value.includes("MELHORENVIO_")) {
    throw new Error(
      `MELHORENVIO_CLIENT_ID parece conter o nome de outra variável em vez do próprio valor (começa com "${value.slice(0, 12)}..."). ` +
        `Confira o valor configurado no ambiente de deploy — deve ser só o número do client_id (ex.: 12011), sem "MELHORENVIO_CLIENT_SECRET=" ou qualquer prefixo.`,
    );
  }
  return value;
}

function apiUrl(): string {
  return env("MELHORENVIO_API_URL").replace(/\/$/, "");
}

function appUrl(): string {
  return env("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
}

export function callbackUrl(): string {
  return `${appUrl()}/api/melhorenvio/callback`;
}

function authHeaders(accessToken: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": USER_AGENT,
  };
}

// ── OAuth (cada loja conecta a própria conta Melhor Envio) ──────────────────

const STATE_TTL_MS = 10 * 60 * 1000;

export function signOAuthState(storeId: string): string {
  const payload = `${storeId}.${Date.now() + STATE_TTL_MS}`;
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const hmac = createHmac("sha256", env("MELHORENVIO_CLIENT_SECRET"))
    .update(payloadB64)
    .digest("hex");
  return `${payloadB64}.${hmac}`;
}

export function verifyOAuthState(state: string): string | null {
  const [payloadB64, hmac] = state.split(".");
  if (!payloadB64 || !hmac) return null;

  const expected = createHmac("sha256", env("MELHORENVIO_CLIENT_SECRET"))
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
  const id = clientId();
  // TODO(debug temporário — remover depois de confirmar em produção que o
  // client_id aparece certo): só os 4 primeiros chars, nunca o secret.
  console.log(`[melhorenvio][debug] client_id usado na URL de autorização: "${id.slice(0, 4)}..." (tamanho ${id.length})`);

  const url = new URL("/oauth/authorize", apiUrl());
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", signOAuthState(storeId));
  url.searchParams.set("scope", SCOPES);
  return url.toString();
}

export interface MEOAuthToken {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

export async function exchangeOAuthCode(code: string): Promise<MEOAuthToken> {
  const res = await fetch(`${apiUrl()}/oauth/token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId(),
      client_secret: env("MELHORENVIO_CLIENT_SECRET"),
      redirect_uri: callbackUrl(),
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao trocar o code por token (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/**
 * O token da Melhor Envio é um JWT — o payload traz o id do usuário no claim
 * `sub` (a API não retorna um `user_id` separado na resposta do /oauth/token
 * como a Mercado Pago faz). Decodificação best-effort só pra exibição/registro.
 */
export function decodeJwtSubject(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString());
    return json.sub ? String(json.sub) : null;
  } catch {
    return null;
  }
}

// ── Cotação ──────────────────────────────────────────────────────────────────

export interface CalculateShippingProduct {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number; // kg
  insurance_value: number;
  quantity: number;
}

export interface MEServiceOption {
  id: number;
  name: string;
  price?: string;
  custom_price?: string;
  delivery_time?: number;
  custom_delivery_time?: number;
  company?: { id: number; name: string; picture?: string };
  error?: string;
}

export async function calculateShipping(params: {
  accessToken: string;
  originCep: string;
  destinationCep: string;
  products: CalculateShippingProduct[];
}): Promise<MEServiceOption[]> {
  const res = await fetch(`${apiUrl()}/api/v2/me/shipment/calculate`, {
    method: "POST",
    headers: authHeaders(params.accessToken),
    body: JSON.stringify({
      from: { postal_code: params.originCep },
      to: { postal_code: params.destinationCep },
      products: params.products,
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`Falha ao calcular frete (${res.status}): ${rawText}`);
  }

  const options: MEServiceOption[] = JSON.parse(rawText);
  const withoutError = options.filter((o) => !o.error && (o.custom_price || o.price));

  // TODO(debug temporário — remover depois de confirmar se é limitação do
  // sandbox): a Melhor Envio responde 200 mesmo quando NENHUMA transportadora
  // atende a rota — cada opção some com `error` em vez de preço, então "sem
  // frete disponível" pode ser a transportadora contratada recusando o
  // trecho (comum em contas de sandbox, ex.: coleta intramunicipal) e não um
  // erro real na nossa chamada. Isso ajuda a distinguir os dois casos sem
  // precisar reproduzir a chamada manualmente de novo.
  if (withoutError.length === 0) {
    console.log(
      `[melhorenvio][debug] calculate ${params.originCep}->${params.destinationCep} voltou 200 mas sem opções válidas. Resposta crua:`,
      rawText,
    );
  }

  return withoutError;
}

// ── Carrinho / compra / geração / rastreio ──────────────────────────────────

export interface MEAddress {
  name: string;
  phone: string;
  email: string;
  document: string;
  company_document?: string;
  address: string;
  complement?: string;
  number: string;
  district: string;
  city: string;
  country_id: string;
  postal_code: string;
  state_abbr: string;
}

export interface AddToCartInput {
  accessToken: string;
  serviceId: number;
  from: MEAddress;
  to: MEAddress;
  products: { name: string; quantity: string; unitary_value: string }[];
  volumes: { height: number; width: number; length: number; weight: number }[];
}

export interface MECartItem {
  id: string;
  protocol: string;
  price: string;
  status: string;
}

export async function addToCart(input: AddToCartInput): Promise<MECartItem> {
  const res = await fetch(`${apiUrl()}/api/v2/me/cart`, {
    method: "POST",
    headers: authHeaders(input.accessToken),
    body: JSON.stringify({
      service: input.serviceId,
      from: input.from,
      to: input.to,
      products: input.products,
      volumes: input.volumes,
      options: { insurance_value: 0, receipt: false, own_hand: false },
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao adicionar frete ao carrinho (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function checkoutCart(accessToken: string, cartItemId: string): Promise<unknown> {
  const res = await fetch(`${apiUrl()}/api/v2/me/shipment/checkout`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ orders: [cartItemId] }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao comprar a etiqueta (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function generateLabel(accessToken: string, cartItemId: string): Promise<unknown> {
  const res = await fetch(`${apiUrl()}/api/v2/me/shipment/generate`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ orders: [cartItemId] }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao gerar a etiqueta (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export interface METrackingEntry {
  id: string;
  protocol: string;
  status: string;
  tracking: string | null;
  melhorenvio_tracking?: string | null;
}

export async function getTracking(accessToken: string, cartItemId: string): Promise<METrackingEntry | null> {
  const res = await fetch(`${apiUrl()}/api/v2/me/shipment/tracking`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ orders: [cartItemId] }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao consultar rastreio (${res.status}): ${await res.text()}`);
  }
  const data: Record<string, METrackingEntry> = await res.json();
  return data[cartItemId] ?? null;
}

// ── Webhook signature (X-ME-Signature, HMAC-SHA256 do corpo bruto, base64) ──
// A doc oficial mostra o header como base64 (ex.: "eW/6UEmwJ7vH13kMsrhjMVzek3Yg
// 0Oa5TDsUSeLVFoM=") — sem prefixo tipo "sha256=". Bug anterior: o código
// gerava o HMAC em hex, que nunca bate com um valor base64 (causa raiz do 401
// "assinatura inválida" mesmo com o secret certo — confirmado contra o
// exemplo literal da doc, não só a descrição do algoritmo).
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", env("MELHORENVIO_WEBHOOK_SECRET"))
    .update(rawBody)
    .digest("base64");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Mapeia o status da Melhor Envio pro enum de shipments.status. */
export function mapShipmentStatus(meStatus: string): "pending" | "purchased" | "posted" | "in_transit" | "delivered" | "cancelled" {
  switch (meStatus) {
    case "released":
    case "generated":
    case "paid":
      return "purchased";
    case "posted":
      return "posted";
    case "in_transit":
    case "transporting":
    case "shipped":
      return "in_transit";
    case "delivered":
      return "delivered";
    case "cancelled":
    case "canceled":
    case "expired":
      return "cancelled";
    default:
      return "pending";
  }
}
