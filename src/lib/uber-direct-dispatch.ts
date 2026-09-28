import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreCredential } from "@/lib/store-credentials";
import { calculateShipping } from "@/lib/melhorenvio/client";
import { purchaseLabelForShipment } from "@/lib/melhorenvio/purchase";
import { onlyDigits } from "@/lib/utils";
import {
  createDelivery,
  getDeliveryQuote,
  type DeliveryManifestItem,
  type UberDirectAddress,
} from "@/lib/uber-direct";

/**
 * Dispara a entrega expressa (Uber Direct) da loja assim que o pagamento
 * daquela loja e confirmado — sem aprovacao manual, chamado pelo settlePayment.
 *
 * Idempotente: so roda com o shipment ainda em 'pending'. Nada aqui propaga
 * erro: o pagamento do comprador JA foi confirmado e nao pode ser desfeito por
 * uma falha de logistica. Quando a criacao da entrega falha, o tratamento vai
 * pra handleDispatchFailure() — fallback pro Melhor Envio quando da, e marcacao
 * explicita pra intervencao manual quando nao da.
 */
export async function dispatchExpressDelivery(orderId: string, storeId: string): Promise<void> {
  try {
    await runExpressDispatch(orderId, storeId);
  } catch (err) {
    // Rede /-parsing nas leituras que acontecem antes do try interno, ou falha
    // ao gravar a propria nota de erro: nada disso pode escapar pro
    // settlePayment (que ja tem sua propria guarda, mas esta funcao promete no
    // contrato nunca lancar).
    console.error(
      "[uber-direct][auditoria] falha nao tratada no despacho expresso",
      { orderId, storeId },
      err,
    );
  }
}

async function runExpressDispatch(orderId: string, storeId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: shipment } = await admin
    .from("shipments")
    .select("id, status, carrier, price")
    .eq("order_id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!shipment || shipment.carrier !== "uber_direct" || shipment.status !== "pending") return;

  const { data: order } = await admin
    .from("orders")
    .select(
      "shipping_name, shipping_phone, shipping_cep, shipping_street, shipping_number, shipping_complement, shipping_neighborhood, shipping_city, shipping_state",
    )
    .eq("id", orderId)
    .single();
  if (!order) return;

  const { data: store } = await admin
    .from("stores")
    .select("name, cep, address_street, address_number, address_neighborhood, city, state")
    .eq("id", storeId)
    .single();
  if (!store) return;

  const { data: items } = await admin
    .from("order_items")
    .select("quantity, unit_price, product:products(name)")
    .eq("order_id", orderId)
    .eq("store_id", storeId);
  if (!items || items.length === 0) return;

  const { data: contacts } = await admin
    .from("store_contacts")
    .select("type, value")
    .eq("store_id", storeId);
  const storePhone = onlyDigits(contacts?.find((c) => c.type === "whatsapp")?.value ?? "");

  const pickupAddress: UberDirectAddress = {
    street_address: [[store.address_street, store.address_number].filter(Boolean).join(", ")],
    city: store.city ?? "",
    state: (store.state ?? "").trim().toUpperCase(),
    zip_code: onlyDigits(store.cep ?? ""),
    country: "BR",
  };

  const dropoffAddress: UberDirectAddress = {
    street_address: [[order.shipping_street, order.shipping_number].filter(Boolean).join(", ")],
    city: order.shipping_city ?? "",
    state: (order.shipping_state ?? "").trim().toUpperCase(),
    zip_code: onlyDigits(order.shipping_cep ?? ""),
    country: "BR",
  };

  const manifest: DeliveryManifestItem[] = items.map((item) => {
    const product = item.product as unknown as { name: string } | null;
    return {
      name: product?.name ?? "Produto",
      quantity: item.quantity,
      priceCents: Math.round(item.unit_price * 100),
    };
  });

  // Valor declarado da carga, em centavos: preco unitario x quantidade de cada
  // item. O price por item nao alimenta manifest.total_value sozinho (a Uber
  // devolve 0 quando este campo nao vai), e o efeito exato dele numa reclamacao
  // de dano/perda a doc publica nao confirma — mas declarar o valor real nunca
  // e pior do que declarar zero.
  const manifestTotalValueCents = manifest.reduce(
    (total, item) => total + (item.priceCents ?? 0) * item.quantity,
    0,
  );

  try {
    // A cotacao do checkout nao serve mais: quote_id da Uber tem validade curta
    // e o pagamento pode ter levado minutos (Pix) ou muito mais. Recota agora e
    // usa o quote_id novo.
    const quote = await getDeliveryQuote(pickupAddress, dropoffAddress);
    if (!quote.id) {
      throw new Error("cotacao da Uber Direct veio sem quote_id");
    }

    // O comprador ja pagou o frete cotado no checkout. Se a recotacao subiu, a
    // diferenca fica com a plataforma/loja — nao da pra cobrar de novo. So
    // registra pra conferencia.
    const paidPrice = shipment.price ?? 0;
    const quotedPrice = quote.fee / 100;
    if (Math.abs(quotedPrice - paidPrice) > 0.01) {
      console.warn(
        "[uber-direct] frete recotado difere do pago",
        { orderId, storeId, paidPrice, quotedPrice },
      );
    }

    const delivery = await createDelivery(
      quote.id,
      pickupAddress,
      dropoffAddress,
      {
        pickupName: store.name,
        pickupPhone: storePhone || "00000000000",
        dropoffName: order.shipping_name ?? "",
        dropoffPhone: onlyDigits(order.shipping_phone ?? ""),
        dropoffNotes: order.shipping_complement ?? undefined,
      },
      manifest,
      orderId + ":" + storeId,
      manifestTotalValueCents,
    );

    await admin
      .from("shipments")
      .update({
        status: "purchased",
        uber_delivery_id: delivery.id,
        uber_delivery_status: delivery.status,
        uber_tracking_url: delivery.trackingUrl,
        fulfillment_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipment.id);
  } catch (err) {
    await handleDispatchFailure({
      orderId,
      storeId,
      shipmentId: shipment.id,
      paidPrice: shipment.price ?? 0,
      error: err,
    });
  }
}

/**
 * Fase 5 — a entrega expressa nao saiu (sem cobertura real apesar do raio,
 * erro de API, problema de cobranca). O pedido nao pode travar nem inventar
 * sucesso, entao:
 *
 * 1. loga o erro com detalhe pra auditoria;
 * 2. tenta fallback automatico pro Melhor Envio — so aceita um servico que
 *    custe ate o que o comprador JA pagou de frete, porque cobrar a diferenca
 *    depois nao e uma opcao;
 * 3. sem fallback viavel, o shipment fica 'pending' com fulfillment_note
 *    dizendo o que houve — e o sinal de que precisa de gente.
 */
async function handleDispatchFailure(params: {
  orderId: string;
  storeId: string;
  shipmentId: string;
  paidPrice: number;
  error: unknown;
}): Promise<void> {
  const admin = createAdminClient();
  const detail = params.error instanceof Error ? params.error.message : String(params.error);

  console.error(
    "[uber-direct][auditoria] createDelivery falhou",
    { orderId: params.orderId, storeId: params.storeId },
    params.error,
  );

  // Roda tambem de dentro de um catch: se lancasse, a excecao escaparia da
  // funcao inteira e mascararia o erro original.
  const markManual = async (note: string) => {
    try {
      await admin
        .from("shipments")
        .update({ status: "pending", fulfillment_note: note, updated_at: new Date().toISOString() })
        .eq("id", params.shipmentId);
    } catch (err) {
      console.error(
        "[uber-direct][auditoria] falha ao gravar fulfillment_note",
        { shipmentId: params.shipmentId },
        err,
      );
    }
  };

  try {
    const fallback = await findMelhorEnvioFallback(params.orderId, params.storeId, params.paidPrice);

    if (!fallback) {
      await markManual(
        "Entrega expressa falhou (" + detail + "). Sem alternativa do Melhor Envio dentro do frete ja pago — precisa de tratamento manual.",
      );
      return;
    }

    // Troca de transportadora mantendo o preco que o comprador pagou: o
    // service_id passa a ser o do Melhor Envio, entao purchaseLabelForShipment
    // consegue comprar a etiqueta normalmente.
    await admin
      .from("shipments")
      .update({
        carrier: "melhorenvio",
        service_id: String(fallback.serviceId),
        service_name: fallback.serviceName,
        delivery_time_days: fallback.deliveryTimeDays,
        status: "pending",
        uber_delivery_id: null,
        uber_delivery_status: null,
        uber_tracking_url: null,
        fulfillment_note:
          "Entrega expressa falhou (" + detail + "). Trocado automaticamente para " +
          fallback.serviceName + " (Melhor Envio), cotado a R$" + fallback.price.toFixed(2) +
          " dentro do frete pago de R$" + params.paidPrice.toFixed(2) + ".",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.shipmentId);

    await purchaseLabelForShipment(params.orderId, params.storeId);
  } catch (err) {
    console.error(
      "[uber-direct][auditoria] fallback do Melhor Envio tambem falhou",
      { orderId: params.orderId, storeId: params.storeId },
      err,
    );
    await markManual(
      "Entrega expressa falhou (" + detail + ") e o fallback do Melhor Envio tambem nao pode ser aplicado — precisa de tratamento manual.",
    );
  }
}

interface FallbackService {
  serviceId: number;
  serviceName: string;
  price: number;
  deliveryTimeDays: number;
}

/**
 * Recota o Melhor Envio pra essa loja/endereco e devolve o servico mais barato
 * que caiba no frete ja pago. Devolve null quando a loja nao tem Melhor Envio
 * conectado, faltam dimensoes dos produtos, ou nenhum servico cabe no valor.
 */
async function findMelhorEnvioFallback(
  orderId: string,
  storeId: string,
  paidPrice: number,
): Promise<FallbackService | null> {
  const admin = createAdminClient();

  const credential = await getStoreCredential(storeId, "melhorenvio");
  if (!credential) return null;

  const { data: store } = await admin.from("stores").select("cep").eq("id", storeId).single();
  const { data: order } = await admin.from("orders").select("shipping_cep").eq("id", orderId).single();
  if (!store?.cep || !order?.shipping_cep) return null;

  const { data: items } = await admin
    .from("order_items")
    .select("quantity, unit_price, product:products(height_cm, width_cm, length_cm, weight_grams)")
    .eq("order_id", orderId)
    .eq("store_id", storeId);
  if (!items || items.length === 0) return null;

  const products = [];
  for (const item of items) {
    const product = item.product as unknown as {
      height_cm: number | null;
      width_cm: number | null;
      length_cm: number | null;
      weight_grams: number | null;
    } | null;

    // Sem dimensoes o Melhor Envio nao cota — e um chute aqui viraria etiqueta
    // errada, entao e melhor cair pra tratamento manual.
    if (!product?.height_cm || !product.width_cm || !product.length_cm || !product.weight_grams) return null;

    products.push({
      id: orderId + ":" + storeId + ":" + products.length,
      width: Math.ceil(product.width_cm),
      height: Math.ceil(product.height_cm),
      length: Math.ceil(product.length_cm),
      weight: product.weight_grams / 1000,
      insurance_value: item.unit_price,
      quantity: item.quantity,
    });
  }

  const services = await calculateShipping({
    accessToken: credential.accessToken,
    originCep: onlyDigits(store.cep),
    destinationCep: onlyDigits(order.shipping_cep),
    products,
  });

  const affordable = services
    .map((service) => ({
      serviceId: service.id,
      serviceName: service.name,
      price: Number(service.custom_price ?? service.price ?? 0),
      deliveryTimeDays: service.custom_delivery_time ?? service.delivery_time ?? 0,
    }))
    .filter((service) => service.price > 0 && service.price <= paidPrice + 0.01)
    .sort((a, b) => a.price - b.price);

  return affordable[0] ?? null;
}
