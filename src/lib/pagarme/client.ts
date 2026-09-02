/**
 * Wrapper mínimo para a API REST v5 do Pagar.me.
 * https://api.pagar.me/core/v5
 *
 * Autenticação: HTTP Basic Auth com a `PAGARME_SECRET_KEY` como usuário e
 * senha vazia (`Authorization: Basic base64(SECRET_KEY:)`).
 *
 * Este módulo é `server-only` — a secret key NUNCA pode ir para o cliente.
 */

const BASE_URL = "https://api.pagar.me/core/v5";

export class PagarmeError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "PagarmeError";
    this.status = status;
    this.body = body;
  }
}

function authHeader(): string {
  const secret = process.env.PAGARME_SECRET_KEY;
  if (!secret) {
    throw new Error("PAGARME_SECRET_KEY não configurada.");
  }
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

async function request<T>(
  path: string,
  init: { method: string; body?: unknown } = { method: "GET" },
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const message =
      (json as { message?: string })?.message ??
      `Pagar.me respondeu ${res.status}`;
    throw new PagarmeError(message, res.status, json);
  }

  return json as T;
}

// ── Tipos (parciais — só o que usamos) ──────────────────────────────────────

export interface PagarmeAddress {
  street: string;
  street_number: string;
  complementary?: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  reference_point?: string;
}

export interface CreateRecipientInput {
  code: string;
  register_information: {
    type: "individual" | "corporation";
    document: string;
    name?: string;
    email: string;
    site_url?: string;
    mother_name?: string;
    birthdate?: string;
    monthly_income?: number;
    professional_occupation?: string;
    annual_revenue?: number;
    corporation_type?: string;
    founding_date?: string;
    company_name?: string;
    trading_name?: string;
    phone_numbers?: { ddd: string; number: string; type: string }[];
    address?: PagarmeAddress;
    main_address?: PagarmeAddress;
    managing_partners?: unknown[];
  };
  default_bank_account: {
    holder_name: string;
    holder_type: "individual" | "company";
    holder_document: string;
    bank: string;
    branch_number: string;
    branch_check_digit?: string;
    account_number: string;
    account_check_digit: string;
    type: "checking" | "savings";
  };
  transfer_settings?: {
    transfer_enabled: boolean;
    transfer_interval?: "Daily" | "Weekly" | "Monthly";
    transfer_day?: number;
  };
  metadata?: Record<string, string>;
}

export interface PagarmeRecipient {
  id: string;
  status: string;
  [key: string]: unknown;
}

export interface CreateOrderSplit {
  amount: number;
  recipient_id: string;
  type: "flat" | "percentage";
  options: {
    liable: boolean;
    charge_processing_fee: boolean;
    charge_remainder_fee: boolean;
  };
}

export interface CreateOrderInput {
  code: string;
  closed?: boolean;
  customer: {
    name: string;
    email: string;
    type?: "individual" | "company";
    document?: string;
  };
  items: {
    amount: number; // em centavos
    description: string;
    quantity: number;
    code?: string;
  }[];
  payments: {
    payment_method: "pix" | "credit_card";
    pix?: { expires_in: number };
    credit_card?: {
      installments: number;
      statement_descriptor?: string;
      card_token: string;
    };
    split?: CreateOrderSplit[];
  }[];
}

export interface PagarmeCharge {
  id: string;
  code?: string;
  status: string;
  payment_method: string;
  amount: number;
  last_transaction?: {
    id: string;
    status: string;
    qr_code?: string;
    qr_code_url?: string;
    expires_at?: string;
    [key: string]: unknown;
  };
}

export interface PagarmeOrder {
  id: string;
  code?: string;
  status: string;
  amount: number;
  charges?: PagarmeCharge[];
  [key: string]: unknown;
}

// ── Funções públicas ───────────────────────────────────────────────────────

/** Cria um recebedor (recipient) para split de marketplace. */
export function createRecipient(
  data: CreateRecipientInput,
): Promise<PagarmeRecipient> {
  return request<PagarmeRecipient>("/recipients", {
    method: "POST",
    body: data,
  });
}

/** Cria um pedido (order) com cobrança e, opcionalmente, split. */
export function createOrder(data: CreateOrderInput): Promise<PagarmeOrder> {
  return request<PagarmeOrder>("/orders", { method: "POST", body: data });
}

/** Consulta um pedido pelo id (`or_...`). */
export function getOrder(id: string): Promise<PagarmeOrder> {
  return request<PagarmeOrder>(`/orders/${id}`, { method: "GET" });
}
