"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shippingAddressSchema, type ShippingAddressInput } from "@/lib/validations";
import { onlyDigits } from "@/lib/utils";
import { quoteShippingForCart } from "@/lib/shipping-quotes";
import { matchSelectionToQuotes, validateShippingSelection } from "@/lib/shipping-validation";
import { getConnectedStoreIds } from "@/lib/store-credentials";
import { findStoresWithoutPayments, storeWithoutPaymentsMessage } from "@/lib/store-payments";
import type { CheckoutItemInput, SelectedShippingInput, ShippingChangedError } from "@/types/actions";

/**
 * Cria o pedido (orders + order_items, status pending) revalidando preço e
 * estoque no servidor — nunca confia no total calculado no carrinho (client).
 * Também grava o endereço de entrega e cria um `shipments` (pending) por
 * loja com o frete escolhido — a etiqueta em si só é comprada depois que o
 * pagamento é confirmado (ver lib/mercadopago/settle.ts).
 *
 * O frete NUNCA é confiado ao cliente: o servidor exige exatamente uma opção
 * por loja do carrinho, recota cada loja com a mesma lógica do checkout
 * (horário, pausa, raio, WhatsApp, peso) usando o endereço do próprio pedido, e
 * grava preço/prazo/nome da cotação nova. total_amount também é calculado só
 * aqui. Ver lib/shipping-validation.ts.
 * Usa o client de admin pro insert porque order_items não tem policy de
 * INSERT (o carrinho é multi-loja; a autorização é feita aqui em código,
 * igual ao padrão já usado em submitSellerRequirements/approveStore).
 */
export async function createOrder(
  items: CheckoutItemInput[],
  shippingAddress: ShippingAddressInput,
  selectedShipping: SelectedShippingInput[],
): Promise<{ error: string } | ShippingChangedError | { success: true; orderId: string }> {
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
    .select("id, name, price, stock, status, store_id, stores!inner(status, name)")
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

  // Loja sem Mercado Pago conectado não vende: sem credencial não há como
  // cobrar nem repassar, então o pedido nem chega a ser criado. Validado aqui
  // (servidor); o aviso do carrinho/checkout é só cortesia de UI.
  let connectedStoreIds: Set<string>;
  try {
    connectedStoreIds = await getConnectedStoreIds(storeIds, "mercadopago");
  } catch (err) {
    console.error("[orders] não foi possível verificar o Mercado Pago das lojas:", err);
    return { error: "Não foi possível confirmar os pagamentos das lojas agora. Tente novamente em instantes." };
  }
  const withoutPayments = findStoresWithoutPayments(storeIds, connectedStoreIds);
  if (withoutPayments.length > 0) {
    const names = withoutPayments.map((id) => {
      const product = products.find((p) => p.store_id === id);
      return (product?.stores as unknown as { name?: string } | null)?.name ?? "Loja";
    });
    return { error: storeWithoutPaymentsMessage(names) };
  }

  // Frete, etapa 1 (estrutural): uma opção por loja do carrinho, nenhuma de
  // fora, nenhuma duplicada, preço mostrado > 0.
  const structural = validateShippingSelection(storeIds, selectedShipping);
  if (!structural.ok) return { error: structural.message };

  // Frete, etapa 2: recota no servidor com o endereço do PRÓPRIO pedido e
  // confronta a escolha. Falha na cotação (Melhor Envio/Uber fora do ar) nunca
  // cai pro valor do cliente — não cria o pedido.
  const quoteResult = await quoteShippingForCart(
    {
      cep: address.cep,
      city: address.address_city,
      state: address.address_state,
      street: address.address_street,
      number: address.address_number,
      neighborhood: address.address_neighborhood,
    },
    items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
  );
  if ("error" in quoteResult) {
    console.error("[orders][auditoria] cotação de frete do servidor falhou no createOrder:", quoteResult.error);
    return { error: "Não foi possível confirmar o frete agora. Tente novamente em instantes." };
  }

  const shippingCheck = matchSelectionToQuotes(selectedShipping, quoteResult.quotes);
  if (!shippingCheck.ok) {
    if (shippingCheck.code === "option_unavailable" || shippingCheck.code === "price_changed") {
      return { error: shippingCheck.message, shippingChanged: true, quotes: quoteResult.quotes };
    }
    return { error: shippingCheck.message };
  }
  const validatedShipping = shippingCheck.shipments;

  const productsTotal = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
  const shippingTotal = validatedShipping.reduce((sum, s) => sum + s.price, 0);

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

  // Tudo aqui vem da cotação do servidor (validatedShipping), nunca do cliente.
  const { error: shipmentsError } = await admin.from("shipments").insert(
    validatedShipping.map((s) => ({
      order_id: order.id,
      store_id: s.storeId,
      carrier: s.carrier,
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

  // O estoque não é decrementado aqui — o único decremento é o do trigger
  // handle_stock_on_order, quando o pagamento confirma (order_items vira
  // 'confirmed'). A checagem de `stock >= quantidade` lá em cima já bloqueia
  // a criação do pedido sem estoque suficiente; entre a criação e a
  // confirmação, o trigger é quem garante a última palavra.
  return { success: true, orderId: order.id as string };
}
