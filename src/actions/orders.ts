"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CheckoutCartItem {
  productId: string;
  quantity: number;
}

interface CreateOrderResult {
  error?: string;
  orderId?: string;
}

/**
 * Cria um pedido (`orders`) + itens (`order_items`) com status `pending` a
 * partir do carrinho. Revalida preço e estoque contra o banco — o cliente
 * nunca dita o preço.
 */
export async function createOrder(
  items: CheckoutCartItem[],
  notes?: string,
): Promise<CreateOrderResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado para finalizar a compra." };

  const cleaned = items
    .filter((i) => i.productId && i.quantity > 0)
    .map((i) => ({ productId: i.productId, quantity: Math.floor(i.quantity) }));

  if (cleaned.length === 0) return { error: "Seu carrinho está vazio." };

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, price, stock, status, store_id, stores(id, status)")
    .in(
      "id",
      cleaned.map((i) => i.productId),
    );

  if (productsError || !products) {
    return { error: "Não foi possível validar os produtos do carrinho." };
  }

  const rows: {
    product_id: string;
    store_id: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }[] = [];

  for (const item of cleaned) {
    const product = products.find((p) => p.id === item.productId) as
      | {
          id: string;
          name: string;
          price: number;
          stock: number;
          status: string;
          store_id: string;
          stores: { id: string; status: string } | { id: string; status: string }[] | null;
        }
      | undefined;

    if (!product) return { error: "Um dos produtos não está mais disponível." };

    const store = Array.isArray(product.stores) ? product.stores[0] : product.stores;

    if (product.status !== "active" || store?.status !== "active") {
      return { error: `"${product.name}" não está mais disponível para compra.` };
    }
    if (product.stock < item.quantity) {
      return {
        error: `Estoque insuficiente para "${product.name}" (${product.stock} disponível).`,
      };
    }

    rows.push({
      product_id: product.id,
      store_id: product.store_id,
      quantity: item.quantity,
      unit_price: product.price,
      subtotal: Number((product.price * item.quantity).toFixed(2)),
    });
  }

  const total = Number(
    rows.reduce((sum, r) => sum + r.subtotal, 0).toFixed(2),
  );

  // service role: `order_items` não tem policy de INSERT para o comprador.
  // A autorização já foi feita acima (usuário logado + validação de preço/estoque).
  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      buyer_id: user.id,
      status: "pending",
      total_amount: total,
      notes: notes?.trim() || null,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { error: "Erro ao criar o pedido. Tente novamente." };
  }

  const { error: itemsError } = await admin.from("order_items").insert(
    rows.map((r) => ({
      order_id: order.id,
      product_id: r.product_id,
      store_id: r.store_id,
      quantity: r.quantity,
      unit_price: r.unit_price,
      subtotal: r.subtotal,
      item_status: "pending" as const,
    })),
  );

  if (itemsError) {
    await admin.from("orders").delete().eq("id", order.id);
    return { error: "Erro ao registrar os itens do pedido. Tente novamente." };
  }

  return { orderId: order.id };
}
