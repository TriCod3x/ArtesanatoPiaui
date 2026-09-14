"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CheckoutItemInput {
  productId: string;
  quantity: number;
}

/**
 * Cria o pedido (orders + order_items, status pending) revalidando preço e
 * estoque no servidor — nunca confia no total calculado no carrinho (client).
 * Usa o client de admin pro insert porque order_items não tem policy de
 * INSERT (o carrinho é multi-loja; a autorização é feita aqui em código,
 * igual ao padrão já usado em submitSellerRequirements/approveStore).
 */
export async function createOrder(items: CheckoutItemInput[]) {
  if (items.length === 0) return { error: "Carrinho vazio." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const admin = createAdminClient();

  const productIds = items.map((i) => i.productId);
  const { data: products } = await admin
    .from("products")
    .select("id, name, price, stock, status, store_id, stores!inner(status)")
    .in("id", productIds);

  if (!products || products.length !== productIds.length) {
    return { error: "Um ou mais produtos não foram encontrados." };
  }

  const productById = new Map(products.map((p) => [p.id, p]));

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product) continue;
    if (item.quantity < 1) return { error: `Quantidade inválida para "${product.name}".` };
    if (product.status !== "active" || (product.stores as unknown as { status: string })?.status !== "active") {
      return { error: `"${product.name}" não está disponível no momento.` };
    }
    if (product.stock < item.quantity) {
      return { error: `Estoque insuficiente para "${product.name}" (disponível: ${product.stock}).` };
    }
  }

  const orderItems = items.map((item) => {
    const product = productById.get(item.productId)!;
    return {
      product_id: product.id,
      store_id: product.store_id,
      quantity: item.quantity,
      unit_price: product.price,
      subtotal: Math.round(product.price * item.quantity * 100) / 100,
    };
  });

  const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({ buyer_id: user.id, total_amount: totalAmount, status: "pending" })
    .select("id")
    .single();

  if (orderError || !order) return { error: "Erro ao criar o pedido. Tente novamente." };

  const { error: itemsError } = await admin
    .from("order_items")
    .insert(orderItems.map((i) => ({ ...i, order_id: order.id })));

  if (itemsError) {
    await admin.from("orders").delete().eq("id", order.id);
    return { error: "Erro ao criar os itens do pedido. Tente novamente." };
  }

  for (const item of items) {
    const product = productById.get(item.productId)!;
    await admin
      .from("products")
      .update({ stock: product.stock - item.quantity })
      .eq("id", product.id);
  }

  return { success: true, orderId: order.id as string };
}
