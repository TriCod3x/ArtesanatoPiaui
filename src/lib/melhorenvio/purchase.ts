import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreCredential } from "@/lib/store-credentials";
import { onlyDigits } from "@/lib/utils";
import { addToCart, checkoutCart, generateLabel, getTracking, type MEAddress } from "./client";

/**
 * Compra a etiqueta de uma loja específica do pedido: adiciona o frete já
 * escolhido no checkout ao carrinho Melhor Envio da loja (usando o token
 * DAQUELA loja — cada uma tem sua própria conta), paga (debita da carteira
 * Melhor Envio do vendedor) e gera a etiqueta. Chamado pelo settlePayment
 * assim que o pagamento daquela loja é confirmado.
 *
 * Idempotente: só roda se shipments.status ainda for 'pending'. Erros aqui
 * (ex.: saldo insuficiente na carteira do vendedor) são logados mas NÃO
 * propagam — o pagamento do comprador já foi confirmado e não pode ser
 * desfeito por uma falha de frete; o vendedor precisa comprar manualmente
 * pelo painel da Melhor Envio nesse caso.
 *
 * Simplificação conhecida: a Melhor Envio pede `volumes` (caixas físicas) —
 * como este app não modela empacotamento, tratamos o pedido inteiro daquela
 * loja como UMA caixa (maior altura/largura/comprimento entre os itens,
 * peso somado). Correto pra a maioria dos casos de uma loja de artesanato,
 * mas não é uma otimização real de empacotamento multi-item.
 */
export async function purchaseLabelForShipment(orderId: string, storeId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: shipment } = await admin
    .from("shipments")
    .select("id, service_id, status")
    .eq("order_id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!shipment || shipment.status !== "pending" || !shipment.service_id) return;

  const { data: order } = await admin
    .from("orders")
    .select(
      "buyer_id, shipping_name, shipping_phone, shipping_cep, shipping_street, shipping_number, shipping_complement, shipping_neighborhood, shipping_city, shipping_state",
    )
    .eq("id", orderId)
    .single();
  if (!order) return;

  const { data: store } = await admin
    .from("stores")
    .select("name, owner_id, cep, address_street, address_number, address_complement, address_neighborhood, city, state")
    .eq("id", storeId)
    .single();
  if (!store) return;

  const credential = await getStoreCredential(storeId, "melhorenvio");
  if (!credential) {
    console.error(`[melhorenvio] loja ${storeId} sem Melhor Envio conectado — etiqueta do pedido ${orderId} não comprada`);
    return;
  }

  const { data: items } = await admin
    .from("order_items")
    .select("quantity, unit_price, product:products(name, height_cm, width_cm, length_cm, weight_grams)")
    .eq("order_id", orderId)
    .eq("store_id", storeId);
  if (!items || items.length === 0) return;

  const { data: verification } = await admin
    .from("seller_verifications")
    .select("cpf, cnpj")
    .eq("user_id", store.owner_id)
    .maybeSingle();
  const { data: contacts } = await admin
    .from("store_contacts")
    .select("type, value")
    .eq("store_id", storeId);
  const sellerPhone = contacts?.find((c) => c.type === "whatsapp")?.value ?? "";

  const { data: payment } = await admin
    .from("payments")
    .select("payer_cpf")
    .eq("order_id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  const [{ data: sellerAuth }, { data: buyerAuth }] = await Promise.all([
    admin.auth.admin.getUserById(store.owner_id),
    admin.auth.admin.getUserById(order.buyer_id),
  ]);

  const from: MEAddress = {
    name: store.name,
    phone: onlyDigits(sellerPhone) || "00000000000",
    email: sellerAuth.user?.email ?? "",
    document: onlyDigits(verification?.cnpj || verification?.cpf || ""),
    address: store.address_street ?? "",
    complement: store.address_complement ?? undefined,
    number: store.address_number || "S/N",
    district: store.address_neighborhood ?? "",
    city: store.city,
    country_id: "BR",
    postal_code: onlyDigits(store.cep ?? ""),
    state_abbr: store.state,
  };

  const to: MEAddress = {
    name: order.shipping_name ?? "",
    phone: onlyDigits(order.shipping_phone ?? ""),
    email: buyerAuth.user?.email ?? "",
    // Só temos o CPF do comprador quando ele pagou via Pix — cartão não
    // coleta CPF (o Checkout Pro coleta os dados dele na própria tela deles).
    // Não confirmado se a Melhor Envio exige `document` do destinatário; ver
    // known gaps na memória do projeto.
    document: onlyDigits(payment?.payer_cpf ?? ""),
    address: order.shipping_street ?? "",
    complement: order.shipping_complement ?? undefined,
    number: order.shipping_number || "S/N",
    district: order.shipping_neighborhood ?? "",
    city: order.shipping_city ?? "",
    country_id: "BR",
    postal_code: onlyDigits(order.shipping_cep ?? ""),
    state_abbr: order.shipping_state ?? "",
  };

  const products = items.map((i) => {
    const product = i.product as unknown as { name: string } | null;
    return {
      name: product?.name ?? "Produto",
      quantity: String(i.quantity),
      unitary_value: String(i.unit_price),
    };
  });

  const dims = items.map((i) => i.product as unknown as { height_cm: number; width_cm: number; length_cm: number; weight_grams: number } | null);
  const volumes = [
    {
      height: Math.ceil(Math.max(...dims.map((d) => d?.height_cm ?? 1))),
      width: Math.ceil(Math.max(...dims.map((d) => d?.width_cm ?? 1))),
      length: Math.ceil(Math.max(...dims.map((d) => d?.length_cm ?? 1))),
      weight: dims.reduce((sum, d, idx) => sum + ((d?.weight_grams ?? 0) / 1000) * items[idx].quantity, 0),
    },
  ];

  try {
    const cartItem = await addToCart({
      accessToken: credential.accessToken,
      serviceId: Number(shipment.service_id),
      from,
      to,
      products,
      volumes,
    });

    await admin
      .from("shipments")
      .update({ melhorenvio_cart_id: cartItem.id, melhorenvio_order_id: cartItem.protocol, updated_at: new Date().toISOString() })
      .eq("id", shipment.id);

    await checkoutCart(credential.accessToken, cartItem.id);
    await generateLabel(credential.accessToken, cartItem.id);
    const tracking = await getTracking(credential.accessToken, cartItem.id);

    await admin
      .from("shipments")
      .update({
        status: "purchased",
        tracking_code: tracking?.tracking ?? tracking?.melhorenvio_tracking ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipment.id);
  } catch (err) {
    console.error(`[melhorenvio] falha ao comprar etiqueta (order ${orderId}, store ${storeId}):`, err);
  }
}
