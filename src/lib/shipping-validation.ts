/**
 * Validação do frete escolhido no checkout — função PURA (cotações entram por
 * parâmetro) pra rodar igual no createOrder e nos testes. Sem alias "@/":
 * os testes compilam este arquivo direto com tsc.
 *
 * Princípio: o cliente só diz QUAL opção quer (loja + carrier + serviceId) e o
 * que viu na tela (preço mostrado). Preço, prazo e nome gravados vêm sempre da
 * cotação feita no servidor.
 */

export type ShippingCarrierName = "melhorenvio" | "uber_direct";

/** O que o cliente manda por loja. */
export interface ClientShippingSelection {
  storeId: string;
  carrier: string;
  serviceId: string;
  /** Preço que o comprador viu na tela — só serve pra detectar aumento. */
  price: number;
}

/** Uma opção da cotação do servidor. */
export interface QuotedShippingOption {
  storeId: string;
  carrier: ShippingCarrierName;
  serviceId: string;
  serviceName: string;
  price: number;
  deliveryTimeDays: number;
}

/** Cotação do servidor de UMA loja. */
export interface ServerStoreQuote {
  storeId: string;
  options: QuotedShippingOption[];
  /** Transportadoras cuja API falhou nesta cotação (não é o mesmo que "não oferece"). */
  failedCarriers?: ShippingCarrierName[];
}

export interface ValidatedShipping {
  storeId: string;
  carrier: ShippingCarrierName;
  serviceId: string;
  serviceName: string;
  /** Sempre o preço da cotação do servidor, em reais com 2 casas. */
  price: number;
  deliveryTimeDays: number;
}

export type ShippingValidationFailure =
  | { ok: false; code: "invalid_selection"; message: string }
  | { ok: false; code: "quote_unavailable"; message: string }
  /** A opção escolhida não existe mais na cotação nova (loja fechou, pausou, saiu do raio…). */
  | { ok: false; code: "option_unavailable"; message: string; storeIds: string[] }
  /** O frete do servidor passou do que o cliente viu além da tolerância. */
  | { ok: false; code: "price_changed"; message: string; storeIds: string[] };

export type ShippingValidationResult = { ok: true; shipments: ValidatedShipping[] } | ShippingValidationFailure;

/** Quanto o frete pode subir entre a tela e o pedido sem pedir nova confirmação (R$). */
export const SHIPPING_PRICE_INCREASE_TOLERANCE = 2;

const CARRIERS: readonly string[] = ["melhorenvio", "uber_direct"];

const toCents = (value: number): number => Math.round(value * 100);

/**
 * Etapa 1 — estrutural, antes de qualquer cotação: exatamente uma opção por
 * loja do carrinho, nenhuma de fora, preço mostrado válido (> 0).
 */
export function validateShippingSelection(
  cartStoreIds: string[],
  selected: ClientShippingSelection[],
): { ok: true } | { ok: false; code: "invalid_selection"; message: string } {
  const fail = (message: string) => ({ ok: false as const, code: "invalid_selection" as const, message });

  if (!Array.isArray(selected)) return fail("Frete inválido.");

  const cart = new Set(cartStoreIds);
  const seen = new Set<string>();

  for (const s of selected) {
    if (!s || typeof s.storeId !== "string" || typeof s.serviceId !== "string" || s.serviceId.length === 0) {
      return fail("Frete inválido.");
    }
    if (!cart.has(s.storeId)) return fail("O frete escolhido é de uma loja que não está no carrinho.");
    if (seen.has(s.storeId)) return fail("Há mais de uma opção de frete para a mesma loja.");
    seen.add(s.storeId);

    if (!CARRIERS.includes(s.carrier)) return fail("Transportadora inválida.");
    if (typeof s.price !== "number" || !Number.isFinite(s.price) || toCents(s.price) <= 0) {
      return fail("Valor de frete inválido.");
    }
  }

  for (const storeId of cart) {
    if (!seen.has(storeId)) return fail("Selecione uma opção de frete para todas as lojas do carrinho.");
  }

  return { ok: true };
}

/**
 * Etapa 2 — confronta a escolha com a cotação do servidor. `quotes` null =
 * a cotação inteira falhou (nunca cai pro valor do cliente).
 */
export function matchSelectionToQuotes(
  selected: ClientShippingSelection[],
  quotes: ServerStoreQuote[] | null,
): ShippingValidationResult {
  const unavailable = (): ShippingValidationFailure => ({
    ok: false,
    code: "quote_unavailable",
    message: "Não foi possível confirmar o frete agora. Tente novamente em instantes.",
  });

  if (!quotes) return unavailable();

  const quoteByStore = new Map(quotes.map((q) => [q.storeId, q]));
  const shipments: ValidatedShipping[] = [];
  const missing: string[] = [];
  const changed: string[] = [];

  for (const s of selected) {
    const quote = quoteByStore.get(s.storeId);
    if (!quote) return unavailable();

    const option = quote.options.find((o) => o.carrier === s.carrier && o.serviceId === s.serviceId);
    if (!option) {
      // Sumiu porque a API da transportadora caiu → indisponível, não "mudou".
      if (quote.failedCarriers?.includes(s.carrier as ShippingCarrierName)) return unavailable();
      missing.push(s.storeId);
      continue;
    }

    const serverCents = toCents(option.price);
    if (!Number.isFinite(option.price) || serverCents <= 0) {
      // Preço <= 0 nunca é aceito, nem vindo da cotação.
      return unavailable();
    }

    if (serverCents - toCents(s.price) > toCents(SHIPPING_PRICE_INCREASE_TOLERANCE)) {
      changed.push(s.storeId);
      continue;
    }

    shipments.push({
      storeId: s.storeId,
      carrier: option.carrier,
      serviceId: option.serviceId,
      serviceName: option.serviceName,
      price: serverCents / 100,
      deliveryTimeDays: option.deliveryTimeDays,
    });
  }

  if (missing.length > 0) {
    return {
      ok: false,
      code: "option_unavailable",
      message: "A opção de frete escolhida não está mais disponível. Escolha de novo.",
      storeIds: missing,
    };
  }
  if (changed.length > 0) {
    return {
      ok: false,
      code: "price_changed",
      message: "O frete mudou, confirme de novo.",
      storeIds: changed,
    };
  }

  return { ok: true, shipments };
}

/** As duas etapas juntas (conveniência pros testes e pra quem já tem a cotação). */
export function validateShipping(
  cartStoreIds: string[],
  selected: ClientShippingSelection[],
  quotes: ServerStoreQuote[] | null,
): ShippingValidationResult {
  const structural = validateShippingSelection(cartStoreIds, selected);
  if (!structural.ok) return structural;
  return matchSelectionToQuotes(selected, quotes);
}
