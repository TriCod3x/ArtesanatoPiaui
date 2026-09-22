// Integração de SIMULAÇÃO com a Uber Direct (sandbox). Usada só pela rota de
// teste manual em src/app/api/dev/uber-direct-quote — ainda não plugada no
// checkout real.

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
    fee?: number;
    currency?: string;
    dropoff_eta?: string;
  };

  if (typeof data.fee !== "number" || !data.currency) {
    throw new UberDirectError("Resposta da Uber Direct sem valor de taxa (fee) — provável endereço fora de cobertura.");
  }

  return {
    fee: data.fee, // centavos — ver comentário em DeliveryQuote.fee
    currency: data.currency,
    dropoffEta: data.dropoff_eta ?? null,
    raw: data,
  };
}
