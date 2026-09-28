"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { calculateShipping } from "@/lib/melhorenvio/client";
import { getDeliveryQuote, type UberDirectAddress } from "@/lib/uber-direct";
import { getStoreCredentialsByStoreIds } from "@/lib/store-credentials";
import { EXPRESS_DELIVERY_MAX_KM, UBER_DIRECT_SERVICE_ID } from "@/lib/constants";
import { geocodeAddress, haversineDistanceKm, type Coordinates } from "@/lib/geocoding";
import { onlyDigits } from "@/lib/utils";
import type { ShippingOption } from "@/types";

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
): Promise<ShippingOption | null> {
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
      return null;
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
    };
  } catch (err) {
    console.error(`[uber-direct] cotação expressa indisponível para store ${storeId}:`, err);
    return null;
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
export async function calculateShippingForCart(
  destination: ShippingDestinationInput,
  items: ShippingItemInput[],
): Promise<{ error: string } | { success: true; quotes: StoreShippingQuote[] }> {
  const cep = onlyDigits(destination.cep);
  if (cep.length !== 8) return { error: "CEP inválido." };
  if (items.length === 0) return { error: "Carrinho vazio." };

  const admin = createAdminClient();
  const { data: products } = await admin
    .from("products")
    .select(
      "id, name, price, weight_grams, height_cm, width_cm, length_cm, store_id, stores(id, name, cep, city, state, address_street, address_number, latitude, longitude)",
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
      });
    }
    const group = groups.get(store.id)!;
    const quantity = quantityByProduct.get(product.id) ?? 1;

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

    // 1) Entrega expressa — só pra loja dentro do raio. Entra primeiro na
    // lista por ser a opção mais rápida.
    if (isWithinExpressRadius(group.origin, destinationCoordinates)) {
      const express = await quoteExpressDelivery(storeId, group.storeName, group.origin, destination);
      if (express) options.push(express);
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
        error = `Erro ao calcular frete para ${group.storeName}. Tente novamente.`;
      }
    }

    quotes.push({ storeId, storeName: group.storeName, options, error });
  }

  return { success: true, quotes };
}
