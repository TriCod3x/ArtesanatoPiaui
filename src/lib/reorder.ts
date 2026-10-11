// "Pedir de novo": decide, item a item, o que dá pra recolocar no carrinho
// AGORA. Puro (sem I/O). Usa SEMPRE o preço atual do produto — o unit_price do
// pedido antigo nem entra aqui.

export interface ReorderOrderItem {
  product_id: string | null;
  quantity: number;
}

export interface ReorderProduct {
  id: string;
  name: string;
  price: number;
  stock: number;
  status: string;
  storeStatus: string | null;
}

export type UnavailableReason = "produto_inativo" | "loja_inativa" | "sem_estoque" | "removido";

export interface ReorderAvailable {
  productId: string;
  name: string;
  quantity: number;
  requestedQuantity: number;
  unitPrice: number;
}

export interface ReorderUnavailable {
  productId: string | null;
  name: string;
  reason: UnavailableReason;
}

export interface ReorderPlan {
  available: ReorderAvailable[];
  unavailable: ReorderUnavailable[];
}

export function computeReorder(
  items: ReorderOrderItem[],
  products: Map<string, ReorderProduct>,
): ReorderPlan {
  // Mesmo produto em duas linhas do pedido vira uma só.
  const requested = new Map<string, number>();
  const order: (string | null)[] = [];
  for (const item of items) {
    const qty = Math.max(0, Math.floor(item.quantity));
    if (item.product_id === null) {
      order.push(null);
      continue;
    }
    if (!requested.has(item.product_id)) order.push(item.product_id);
    requested.set(item.product_id, (requested.get(item.product_id) ?? 0) + qty);
  }

  const available: ReorderAvailable[] = [];
  const unavailable: ReorderUnavailable[] = [];

  for (const productId of order) {
    if (productId === null) {
      unavailable.push({ productId: null, name: "Produto removido", reason: "removido" });
      continue;
    }
    const product = products.get(productId);
    if (!product) {
      unavailable.push({ productId, name: "Produto removido", reason: "removido" });
      continue;
    }
    if (product.status !== "active") {
      unavailable.push({ productId, name: product.name, reason: "produto_inativo" });
      continue;
    }
    if (product.storeStatus !== "active") {
      unavailable.push({ productId, name: product.name, reason: "loja_inativa" });
      continue;
    }
    if (product.stock < 1) {
      unavailable.push({ productId, name: product.name, reason: "sem_estoque" });
      continue;
    }
    const want = requested.get(productId) ?? 0;
    if (want < 1) continue;
    available.push({
      productId,
      name: product.name,
      quantity: Math.min(want, product.stock),
      requestedQuantity: want,
      unitPrice: product.price,
    });
  }

  return { available, unavailable };
}
