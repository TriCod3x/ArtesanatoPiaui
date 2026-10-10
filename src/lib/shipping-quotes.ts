// Cotação de frete por loja — usada pelo checkout (calculateShippingForCart) E
// pelo createOrder, que recota no servidor pra nunca confiar no frete do
// cliente. Fica fora de "use server" de propósito: não é uma action chamável
// pelo navegador, é lógica interna.
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateShipping } from "@/lib/melhorenvio/client";
import { getDeliveryQuote, type UberDirectAddress } from "@/lib/uber-direct";
import { getStoreCredentialsByStoreIds } from "@/lib/store-credentials";
import { EXPRESS_DELIVERY_MAX_KM, EXPRESS_MAX_ITEM_WEIGHT_GRAMS, UBER_DIRECT_SERVICE_ID } from "@/lib/constants";
import { getMobilePhoneError } from "@/lib/phone";
import { geocodeAddress, haversineDistanceKm, type Coordinates } from "@/lib/geocoding";
import { onlyDigits } from "@/lib/utils";
import {
  getExpressUnavailableHint,
  isExpressAvailableNow,
  type StoreHoursRow,
} from "@/lib/store-hours";
import type { ShippingCarrier, ShippingOption } from "@/types";

export interface StoreShippingQuote {
  storeId: string;
  storeName: string;
  options: ShippingOption[];
  /**
   * Motivo de a cotação do Melhor Envio não ter saído. Pode vir junto com
   * `options` preenchido: numa loja da mesma cidade, a entrega expressa pode
   * ter cotado mesmo com o Melhor Envio falhando.
   */
  error?: string;
  /**
   * Transportadoras cuja API FALHOU nesta cotação (Uber fora do ar, Melhor
   * Envio com erro). Diferente de "não oferece": o createOrder usa isso pra
   * responder "cotação indisponível" em vez de "o frete mudou".
   */
  failedCarriers?: ShippingCarrier[];
  /**
   * Dica discreta pro checkout: a loja está no raio da entrega expressa, mas
   * ela não pode ser oferecida agora (fora do horário, pausada, sem horário
   * configurado). Só aparece pra essa loja.
   */
  expressHint?: string;
}

export interface ShippingItemInput {
  productId: string;
  quantity: number;
}

/**
 * Endereço de entrega escolhido pelo comprador. O CEP sozinho basta pro Melhor
 * Envio, mas a Uber Direct cota de endereço a endereço (precisa de
 * rua/número/cidade/UF). O endereço completo também é geocodificado no
 * checkout: é a distância até a loja que decide se a entrega expressa aparece.
 */
export interface ShippingDestinationInput {
  cep: string;
  city: string;
  state: string;
  street: string;
  number: string;
  neighborhood?: string;
}

interface StoreOrigin {
  city: string | null;
  state: string | null;
  cep: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  latitude: number | null;
  longitude: number | null;
}

function normalizeState(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Elegibilidade da entrega expressa: distância real entre o endereço DA LOJA e
 * o endereço de entrega, até EXPRESS_DELIVERY_MAX_KM.
 *
 * Substituiu a comparação de cidade/UF como texto, que errava nos dois
 * sentidos: recusava bairro vizinho a 3 km só por cruzar divisa de município e
 * aceitava ponta a ponta de uma cidade extensa. Loja sem coordenadas (nunca
 * geocodificada) não é elegível — ver geocodeStore() em actions/stores.ts.
 */
function isWithinExpressRadius(origin: StoreOrigin, destinationCoordinates: Coordinates | null): boolean {
  if (!destinationCoordinates) return false;
  if (origin.latitude === null || origin.longitude === null) return false;

  const distanceKm = haversineDistanceKm(
    origin.latitude,
    origin.longitude,
    destinationCoordinates.latitude,
    destinationCoordinates.longitude,
  );

  return distanceKm <= EXPRESS_DELIVERY_MAX_KM;
}

/**
 * Motivo de a entrega expressa NÃO poder ser oferecida pra essa loja, ou null
 * se pode. Cobre o que a Uber recusa no despacho (depois do pagamento): telefone
 * de retirada inválido e item pesado demais.
 */
function getExpressBlocker(whatsapp: string | undefined, maxItemWeightGrams: number): string | null {
  if (!whatsapp) return "loja sem WhatsApp em store_contacts";
  const phoneError = getMobilePhoneError(whatsapp);
  if (phoneError) return `WhatsApp da loja inválido (${phoneError})`;
  if (maxItemWeightGrams > EXPRESS_MAX_ITEM_WEIGHT_GRAMS) {
    return `item de ${maxItemWeightGrams} g acima do limite de ${EXPRESS_MAX_ITEM_WEIGHT_GRAMS} g`;
  }
  return null;
}

/** Minutos de agora até `iso`, arredondados pra 5 (mínimo 5). Null se a data não vier ou não parsear. */
function minutesUntilRounded(iso: string | null): number | null {
  if (!iso) return null;
  const eta = new Date(iso).getTime();
  if (Number.isNaN(eta)) return null;

  const minutes = (eta - Date.now()) / 60_000;
  return Math.max(5, Math.round(minutes / 5) * 5);
}

/**
 * Cota a entrega expressa (Uber Direct) da loja até o comprador. Devolve null
 * — em vez de propagar erro — quando a loja não tem endereço completo ou
 * quando a Uber recusa a cotação (fora de cobertura, credencial ausente etc.):
 * nesses casos o checkout só não mostra a opção expressa e segue oferecendo o
 * Melhor Envio normalmente.
 */
async function quoteExpressDelivery(
  storeId: string,
  storeName: string,
  origin: StoreOrigin,
  destination: ShippingDestinationInput,
): Promise<ShippingOption | null | "failed"> {
  if (!origin.addressStreet || !origin.cep || !origin.city || !origin.state) return null;

  const pickupAddress: UberDirectAddress = {
    street_address: [[origin.addressStreet, origin.addressNumber].filter(Boolean).join(", ")],
    city: origin.city,
    state: normalizeState(origin.state),
    zip_code: onlyDigits(origin.cep),
    country: "BR",
  };

  const dropoffAddress: UberDirectAddress = {
    street_address: [[destination.street, destination.number].filter(Boolean).join(", ")],
    city: destination.city,
    state: normalizeState(destination.state),
    zip_code: onlyDigits(destination.cep),
    country: "BR",
  };

  try {
    const quote = await getDeliveryQuote(pickupAddress, dropoffAddress);

    // A Uber devolve `fee` em centavos da moeda de `currency`. O resto do
    // checkout trabalha em reais (unidade cheia), então: divide por 100 e
    // descarta a opção se a moeda não for BRL — somar outra moeda no total do
    // pedido seria simplesmente errado.
    if (quote.currency.toLowerCase() !== "brl") {
      console.error(`[uber-direct] cotação veio em ${quote.currency} para store ${storeId} — opção descartada.`);
      return "failed";
    }

    return {
      storeId,
      storeName,
      carrier: "uber_direct",
      serviceId: UBER_DIRECT_SERVICE_ID,
      serviceName: "Entrega expressa",
      companyName: "Uber Direct",
      price: quote.fee / 100,
      deliveryTimeDays: 0,
      deliveryEtaISO: quote.dropoffEta,
      etaMinutes: minutesUntilRounded(quote.dropoffEta),
    };
  } catch (err) {
    console.error(`[uber-direct] cotação expressa indisponível para store ${storeId}:`, err);
    return "failed";
  }
}

/**
 * Cotação de frete POR LOJA — cada loja usa o próprio CEP de origem e o
 * próprio token Melhor Envio (mesma razão do split 1:1 dos pagamentos: são
 * contas MP/ME independentes, não dá pra cotar/comprar em nome de uma loja
 * usando o token de outra).
 *
 * Quais opções cada loja oferece:
 * - loja a até EXPRESS_DELIVERY_MAX_KM do endereço de entrega (distância entre
 *   coordenadas, ver isWithinExpressRadius) → entrega expressa (Uber Direct) +
 *   Correios/Melhor Envio;
 * - mais longe que isso, ou sem coordenadas → só Correios/Melhor Envio.
 */
export async function quoteShippingForCart(
  destination: ShippingDestinationInput,
  items: ShippingItemInput[],
  now: Date = new Date(),
): Promise<{ error: string } | { success: true; quotes: StoreShippingQuote[] }> {
  const cep = onlyDigits(destination.cep);
  if (cep.length !== 8) return { error: "CEP inválido." };
  if (items.length === 0) return { error: "Carrinho vazio." };

  const admin = createAdminClient();
  const { data: products } = await admin
    .from("products")
    .select(
      "id, name, price, weight_grams, height_cm, width_cm, length_cm, store_id, stores(id, name, cep, city, state, address_street, address_number, latitude, longitude, express_prep_minutes, express_paused)",
    )
    .in(
      "id",
      items.map((i) => i.productId),
    );

  if (!products || products.length === 0) return { error: "Produtos não encontrados." };

  const quantityByProduct = new Map(items.map((i) => [i.productId, i.quantity]));

  const groups = new Map<
    string,
    {
      storeName: string;
      origin: StoreOrigin;
      accessToken: string | null;
      products: { id: string; width: number; height: number; length: number; weight: number; insurance_value: number; quantity: number }[];
      missingDimensions: boolean;
      /** Maior peso unitário (g) entre os itens da loja no carrinho — o limite da Uber é por item. */
      maxItemWeightGrams: number;
      expressPrepMinutes: number;
      expressPaused: boolean;
    }
  >();

  for (const product of products) {
    const store = product.stores as unknown as {
      id: string;
      name: string;
      cep: string | null;
      city: string | null;
      state: string | null;
      address_street: string | null;
      address_number: string | null;
      latitude: number | null;
      longitude: number | null;
      express_prep_minutes: number;
      express_paused: boolean;
    };
    if (!groups.has(store.id)) {
      groups.set(store.id, {
        storeName: store.name,
        origin: {
          city: store.city,
          state: store.state,
          cep: store.cep,
          addressStreet: store.address_street,
          addressNumber: store.address_number,
          latitude: store.latitude,
          longitude: store.longitude,
        },
        accessToken: null,
        products: [],
        missingDimensions: false,
        maxItemWeightGrams: 0,
        expressPrepMinutes: store.express_prep_minutes,
        expressPaused: store.express_paused,
      });
    }
    const group = groups.get(store.id)!;
    const quantity = quantityByProduct.get(product.id) ?? 1;
    group.maxItemWeightGrams = Math.max(group.maxItemWeightGrams, product.weight_grams ?? 0);

    if (!product.weight_grams || !product.height_cm || !product.width_cm || !product.length_cm) {
      group.missingDimensions = true;
      continue;
    }

    group.products.push({
      id: product.id,
      width: Math.ceil(product.width_cm),
      height: Math.ceil(product.height_cm),
      length: Math.ceil(product.length_cm),
      weight: product.weight_grams / 1000,
      insurance_value: product.price,
      quantity,
    });
  }

  // Pré-checagem da entrega expressa: o despacho roda DEPOIS do pagamento, então
  // o que sabemos que a Uber vai recusar tem que tirar a opção já na cotação.
  const { data: whatsappContacts } = await admin
    .from("store_contacts")
    .select("store_id, value")
    .eq("type", "whatsapp")
    .in("store_id", [...groups.keys()]);
  const whatsappByStore = new Map((whatsappContacts ?? []).map((c) => [c.store_id, c.value]));

  // Horário de funcionamento: loja sem nenhuma linha NÃO oferece expressa
  // (padrão seguro — ver isExpressAvailableNow). Lido com o client admin
  // porque a policy pública só enxerga lojas ativas e a cotação não deve
  // depender disso.
  const { data: hoursRows } = await admin
    .from("store_hours")
    .select("store_id, weekday, opens, closes")
    .in("store_id", [...groups.keys()]);
  const hoursByStore = new Map<string, StoreHoursRow[]>();
  for (const row of hoursRows ?? []) {
    const list = hoursByStore.get(row.store_id) ?? [];
    list.push({ weekday: row.weekday, opens: row.opens, closes: row.closes });
    hoursByStore.set(row.store_id, list);
  }

  const credentials = await getStoreCredentialsByStoreIds([...groups.keys()], "melhorenvio");
  for (const [storeId, group] of groups) {
    group.accessToken = credentials.get(storeId)?.accessToken ?? null;
  }

  // Geocodifica o destino UMA vez por cotação, não uma vez por loja: o
  // Nominatim é limitado a 1 req/s e o carrinho pode ter várias lojas.
  // Se não resolver, nenhuma loja fica elegível à expressa e o checkout segue
  // só com Melhor Envio — é a degradação esperada, não um erro pro comprador.
  const destinationCoordinates = await geocodeAddress({
    street: destination.street,
    number: destination.number,
    neighborhood: destination.neighborhood ?? null,
    city: destination.city,
    state: destination.state,
    cep,
  });

  if (!destinationCoordinates) {
    console.warn("[geocoding] endereço de entrega não resolveu — entrega expressa não será oferecida");
  }

  const quotes: StoreShippingQuote[] = [];

  for (const [storeId, group] of groups) {
    const options: ShippingOption[] = [];
    let error: string | undefined;
    let expressHint: string | undefined;
    const failedCarriers: ShippingCarrier[] = [];

    // 1) Entrega expressa — só pra loja dentro do raio. Entra primeiro na
    // lista por ser a opção mais rápida.
    if (isWithinExpressRadius(group.origin, destinationCoordinates)) {
      const expressBlocker = getExpressBlocker(whatsappByStore.get(storeId), group.maxItemWeightGrams);
      if (expressBlocker) {
        console.warn(`[uber-direct][auditoria] entrega expressa omitida para store ${storeId}: ${expressBlocker}`);
      } else {
        const availability = isExpressAvailableNow({
          hours: hoursByStore.get(storeId) ?? [],
          paused: group.expressPaused,
          prepMinutes: group.expressPrepMinutes,
          now,
        });

        if (!availability.available) {
          // Só loja DENTRO do raio chega aqui — não polui o log com lojas longe.
          console.warn(
            `[uber-direct][auditoria] entrega expressa omitida para store ${storeId}: fora do horário (${availability.reason})`,
          );
          expressHint = getExpressUnavailableHint(availability);
        } else {
          const express = await quoteExpressDelivery(storeId, group.storeName, group.origin, destination);
          if (express === "failed") failedCarriers.push("uber_direct");
          else if (express) options.push(express);
        }
      }
    }

    // 2) Correios/Melhor Envio — oferecido sempre, independente da cidade.
    if (!group.accessToken) {
      error = `${group.storeName} ainda não conectou o Melhor Envio e não pode calcular frete no momento.`;
    } else if (group.missingDimensions || group.products.length === 0) {
      error = `${group.storeName} tem produtos sem peso/dimensões cadastrados — não é possível calcular o frete.`;
    } else if (!group.origin.cep) {
      error = `${group.storeName} não tem CEP de origem cadastrado.`;
    } else {
      try {
        const services = await calculateShipping({
          accessToken: group.accessToken,
          originCep: onlyDigits(group.origin.cep),
          destinationCep: cep,
          products: group.products,
        });

        for (const s of services) {
          options.push({
            storeId,
            storeName: group.storeName,
            carrier: "melhorenvio",
            serviceId: String(s.id),
            serviceName: s.name,
            companyName: s.company?.name ?? "",
            price: Number(s.custom_price ?? s.price ?? 0),
            deliveryTimeDays: s.custom_delivery_time ?? s.delivery_time ?? 0,
          });
        }
      } catch (err) {
        console.error(`[melhorenvio] calculateShipping falhou para store ${storeId}:`, err);
        failedCarriers.push("melhorenvio");
        error = `Erro ao calcular frete para ${group.storeName}. Tente novamente.`;
      }
    }

    quotes.push({
      storeId,
      storeName: group.storeName,
      options,
      error,
      expressHint,
      ...(failedCarriers.length > 0 ? { failedCarriers } : {}),
    });
  }

  return { success: true, quotes };
}
