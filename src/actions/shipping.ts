"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { calculateShipping } from "@/lib/melhorenvio/client";
import { getStoreCredentialsByStoreIds } from "@/lib/store-credentials";
import { onlyDigits } from "@/lib/utils";
import type { ShippingOption } from "@/types";

export interface StoreShippingQuote {
  storeId: string;
  storeName: string;
  options: ShippingOption[];
  error?: string;
}

export interface ShippingItemInput {
  productId: string;
  quantity: number;
}

/**
 * Cotação de frete POR LOJA — cada loja usa o próprio CEP de origem e o
 * próprio token Melhor Envio (mesma razão do split 1:1 dos pagamentos: são
 * contas MP/ME independentes, não dá pra cotar/comprar em nome de uma loja
 * usando o token de outra).
 */
export async function calculateShippingForCart(
  destinationCep: string,
  items: ShippingItemInput[],
): Promise<{ error: string } | { success: true; quotes: StoreShippingQuote[] }> {
  const cep = onlyDigits(destinationCep);
  if (cep.length !== 8) return { error: "CEP inválido." };
  if (items.length === 0) return { error: "Carrinho vazio." };

  const admin = createAdminClient();
  const { data: products } = await admin
    .from("products")
    .select("id, name, price, weight_grams, height_cm, width_cm, length_cm, store_id, stores(id, name, cep)")
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
      storeCep: string | null;
      accessToken: string | null;
      products: { id: string; width: number; height: number; length: number; weight: number; insurance_value: number; quantity: number }[];
      missingDimensions: boolean;
    }
  >();

  for (const product of products) {
    const store = product.stores as unknown as { id: string; name: string; cep: string | null };
    if (!groups.has(store.id)) {
      groups.set(store.id, {
        storeName: store.name,
        storeCep: store.cep,
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

  const quotes: StoreShippingQuote[] = [];

  for (const [storeId, group] of groups) {
    if (!group.accessToken) {
      quotes.push({
        storeId,
        storeName: group.storeName,
        options: [],
        error: `${group.storeName} ainda não conectou o Melhor Envio e não pode calcular frete no momento.`,
      });
      continue;
    }
    if (group.missingDimensions || group.products.length === 0) {
      quotes.push({
        storeId,
        storeName: group.storeName,
        options: [],
        error: `${group.storeName} tem produtos sem peso/dimensões cadastrados — não é possível calcular o frete.`,
      });
      continue;
    }
    if (!group.storeCep) {
      quotes.push({
        storeId,
        storeName: group.storeName,
        options: [],
        error: `${group.storeName} não tem CEP de origem cadastrado.`,
      });
      continue;
    }

    try {
      const services = await calculateShipping({
        accessToken: group.accessToken,
        originCep: onlyDigits(group.storeCep),
        destinationCep: cep,
        products: group.products,
      });

      quotes.push({
        storeId,
        storeName: group.storeName,
        options: services.map((s) => ({
          storeId,
          storeName: group.storeName,
          serviceId: String(s.id),
          serviceName: s.name,
          companyName: s.company?.name ?? "",
          price: Number(s.custom_price ?? s.price ?? 0),
          deliveryTimeDays: s.custom_delivery_time ?? s.delivery_time ?? 0,
        })),
      });
    } catch (err) {
      console.error(`[melhorenvio] calculateShipping falhou para store ${storeId}:`, err);
      quotes.push({
        storeId,
        storeName: group.storeName,
        options: [],
        error: `Erro ao calcular frete para ${group.storeName}. Tente novamente.`,
      });
    }
  }

  return { success: true, quotes };
}
