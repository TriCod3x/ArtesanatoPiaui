"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shippingAddressSchema, type ShippingAddressInput } from "@/lib/validations";
import { onlyDigits } from "@/lib/utils";

export interface CheckoutItemInput {
  productId: string;
  quantity: number;
}

export interface SelectedShippingInput {
  storeId: string;
  serviceId: string;
  serviceName: string;
  price: number;
  deliveryTimeDays: number;
}

/**
 * Cria o pedido (orders + order_items, status pending) revalidando preço e
 * estoque no servidor — nunca confia no total calculado no carrinho (client).
 * Também grava o endereço de entrega e cria um `shipments` (pending) por
 * loja com o frete escolhido — a etiqueta em si só é comprada depois que o
 * pagamento é confirmado (ver lib/mercadopago/settle.ts).
 * Usa o client de admin pro insert porque order_items não tem policy de
 * INSERT (o carrinho é multi-loja; a autorização é feita aqui em código,
 * igual ao padrão já usado em submitSellerRequirements/approveStore).
 */
export async function createOrder(
  items: CheckoutItemInput[],
  shippingAddress: ShippingAddressInput,
  selectedShipping: SelectedShippingInput[],
) {
  if (items.length === 0) return { error: "Carrinho vazio." };

  const addressParsed = shippingAddressSchema.safeParse(shippingAddress);
  if (!addressParsed.success) {
    return { error: addressParsed.error.issues[0]?.message ?? "Endereço de entrega inválido." };
  }
  const address = addressParsed.data;

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

  const storeIds = [...new Set(orderItems.map((i) => i.store_id))];
  const shippingByStore = new Map(selectedShipping.map((s) => [s.storeId, s]));
  for (const storeId of storeIds) {
    if (!shippingByStore.has(storeId)) {
      return { error: "Selecione uma opção de frete para todas as lojas do carrinho." };
    }
  }

  const productsTotal = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
  const shippingTotal = selectedShipping.reduce((sum, s) => sum + s.price, 0);

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      buyer_id: user.id,
      total_amount: Math.round((productsTotal + shippingTotal) * 100) / 100,
      status: "pending",
      shipping_name: address.recipient_name,
      shipping_phone: onlyDigits(address.recipient_phone),
      shipping_cep: onlyDigits(address.cep),
      shipping_street: address.address_street,
      shipping_number: address.address_number,
      shipping_complement: address.address_complement || null,
      shipping_neighborhood: address.address_neighborhood,
      shipping_city: address.address_city,
      shipping_state: address.address_state,
    })
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

  const { error: shipmentsError } = await admin.from("shipments").insert(
    selectedShipping.map((s) => ({
      order_id: order.id,
      store_id: s.storeId,
      service_id: s.serviceId,
      service_name: s.serviceName,
      price: s.price,
      delivery_time_days: s.deliveryTimeDays,
      status: "pending",
    })),
  );

  if (shipmentsError) {
    await admin.from("orders").delete().eq("id", order.id);
    return { error: "Erro ao registrar o frete do pedido. Tente novamente." };
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
