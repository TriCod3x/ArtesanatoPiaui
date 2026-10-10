"use server";

import { quoteShippingForCart } from "@/lib/shipping-quotes";
import type {
  ShippingDestinationInput,
  ShippingItemInput,
  StoreShippingQuote,
} from "@/lib/shipping-quotes";

// ATENÇÃO: arquivo "use server" — exporta SOMENTE funções async. Nada de
// `export type { ... }`, `export *` ou constantes: o Next registra as exports
// em runtime e uma export de tipo vira ReferenceError em module evaluation.
// Quem precisa dos tipos importa de "@/lib/shipping-quotes".

/**
 * Cotação de frete POR LOJA para o checkout. A lógica (raio, horário, peso,
 * WhatsApp, Melhor Envio) mora em lib/shipping-quotes.ts e é a MESMA que o
 * createOrder usa pra validar o frete escolhido.
 */
export async function calculateShippingForCart(
  destination: ShippingDestinationInput,
  items: ShippingItemInput[],
): Promise<{ error: string } | { success: true; quotes: StoreShippingQuote[] }> {
  return quoteShippingForCart(destination, items);
}
