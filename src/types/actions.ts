// Tipos de entrada/saída das server actions (src/actions/*).
//
// Moram aqui, e NÃO nos arquivos "use server", de propósito: um arquivo
// "use server" só pode exportar funções async. O Next gera, em tempo de
// execução, o registro das exports desse arquivo — uma export de tipo vira
// referência a um identificador que não existe e derruba o módulo
// (ReferenceError em module evaluation), coisa que tsc e next build não pegam.
// Quem precisa de um destes tipos importa com `import type` daqui.

import type { ShippingCarrier } from "@/types";
import type { StoreShippingQuote } from "@/lib/shipping-quotes";
import type { StoreHoursInputDay } from "@/lib/store-hours";
import type { ProductWithRelations, OrderStatus } from "@/types";
import type { UnavailableReason } from "@/lib/reorder";

export interface ProductSearchResult {
  id: string;
  name: string;
  slug: string;
  price: number;
  categoryName: string | null;
  storeName: string | null;
  imageUrl: string | null;
}

export interface CheckoutItemInput {
  productId: string;
  quantity: number;
}

/**
 * O que o cliente manda sobre o frete. SÓ storeId + carrier + serviceId
 * identificam a escolha; `price` é o que o comprador viu na tela (usado pra
 * detectar aumento). serviceName/deliveryTimeDays são aceitos por
 * compatibilidade com o checkout, mas NUNCA gravados: nome, prazo e preço do
 * shipment vêm da cotação refeita no servidor.
 */
export interface SelectedShippingInput {
  storeId: string;
  /** Quem entrega — decide o que roda quando o pagamento confirma. */
  carrier: ShippingCarrier;
  serviceId: string;
  serviceName: string;
  price: number;
  deliveryTimeDays: number;
}

/** Erro de frete que o comprador pode resolver escolhendo de novo, com as opções atualizadas. */
export interface ShippingChangedError {
  error: string;
  shippingChanged: true;
  quotes: StoreShippingQuote[];
}

export interface SubmitSellerRequirementsData {
  cpf: string;
  cnpj?: string;
  cep: string;
  address_street: string;
  address_number: string;
  address_complement?: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  accept_terms: boolean;
  document: File;
}

export interface ExpressSettingsInput {
  days: StoreHoursInputDay[];
  prepMinutes: number;
  paused: boolean;
}

export type ReleaseExpressPickupResult =
  | { error: string }
  | { success: true; alreadyReleased?: boolean; fallbackToMelhorEnvio?: boolean };

export interface MentionableResult {
  id: string;
  /** Mesmos valores do token no texto: @[Nome](user:ID) / @[Nome](store:ID). */
  tipo: "user" | "store";
  nome: string;
  /** Avatar do usuário ou logo da loja. */
  avatar: string | null;
}

export type SearchMentionablesResult = { error: string } | { results: MentionableResult[] };

export type ToggleRepostResult =
  | { error: string }
  | { success: true; reposted: boolean; count: number };

/** Um pedido do comprador, resumido pro histórico do carrinho. */
export interface BuyerOrderSummary {
  id: string;
  createdAt: string;
  status: OrderStatus;
  totalAmount: number;
  storeNames: string[];
  itemCount: number;
  /** Até 3 itens, pra miniaturas. */
  previewItems: { name: string; imageUrl: string | null }[];
  extraItems: number;
}

export type BuyerOrderHistoryResult =
  | { error: string; unauthenticated?: boolean }
  | { orders: BuyerOrderSummary[]; hasMore: boolean };

export type ReorderItemsResult =
  | { error: string; unauthenticated?: boolean }
  | {
      items: { product: ProductWithRelations; quantity: number; requestedQuantity: number }[];
      unavailable: { name: string; reason: UnavailableReason }[];
    };
