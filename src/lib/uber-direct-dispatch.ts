import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreCredential } from "@/lib/store-credentials";
import { calculateShipping } from "@/lib/melhorenvio/client";
import { purchaseLabelForShipment } from "@/lib/melhorenvio/purchase";
import { onlyDigits } from "@/lib/utils";
import { EXPRESS_REQUOTE_TOLERANCE_CENTS } from "@/lib/constants";
import {
  createDelivery,
  getDeliveryQuote,
  isAmbiguousDeliveryError,
  type DeliveryManifestItem,
  type UberDirectAddress,
} from "@/lib/uber-direct";

/**
 * O que aconteceu no despacho — releaseExpressPickup traduz isso na mensagem
 * pra artesa. Em "retry_later" e "requote_too_high" a liberacao
 * (pickup_released_at) volta pra NULL e o botao reaparece; em "unconfirmed"
 * ela fica preenchida.
 */
export type ExpressDispatchOutcome =
  | { kind: "dispatched" }
  | { kind: "fallback_melhorenvio" }
  /** Falha DEFINITIVA sem fallback: liberacao revertida, pode tentar de novo. */
  | { kind: "retry_later" }
  /** Recotacao acima do frete pago + tolerancia: corrida nao criada, liberacao revertida. */
  | { kind: "requote_too_high" }
  /** Erro ambiguo (a corrida pode existir) ou estado inesperado: liberacao mantida. */
  | { kind: "unconfirmed" }
  | { kind: "skipped" };

/**
 * Dispara a entrega expressa (Uber Direct) da loja. Chamado SO por
 * releaseExpressPickup (actions/express-pickup.ts), depois que a artesa clicou
 * em "Pronto pra retirada" e reivindicou pickup_released_at de forma atomica —
 * o settlePayment nao chama mais a Uber.
 *
 * Idempotente: so roda com o shipment ainda em 'pending', ja liberado
 * (pickup_released_at preenchido) e sem uber_delivery_id. Com uber_delivery_id
 * preenchido nunca despacha e nunca reverte a liberacao.
 *
 * Nada aqui propaga erro: o pagamento do comprador JA foi confirmado e nao
 * pode ser desfeito por uma falha de logistica.
 */
export async function dispatchExpressDelivery(orderId: string, storeId: string): Promise<ExpressDispatchOutcome> {
  try {
    return await runExpressDispatch(orderId, storeId);
  } catch (err) {
    // Excecao nao prevista: nao da pra saber em que ponto parou (talvez depois
    // do createDelivery). Mantem a liberacao — reverter aqui poderia gerar
    // uma segunda corrida.
    console.error(
      "[uber-direct][auditoria] falha nao tratada no despacho expresso",
      { orderId, storeId },
      err,
    );
    return { kind: "unconfirmed" };
  }
}

/**
 * Reverte a liberacao (botao volta pra artesa) e grava o motivo. So age se a
 * corrida NAO existe (uber_delivery_id nulo) e o shipment ainda e da Uber.
 * Devolve false se nao conseguiu reverter.
 */
async function resetRelease(shipmentId: string, note: string): Promise<boolean> {
  const admin = createAdminClient();
  try {
    const { data, error } = await admin
      .from("shipments")
      .update({
        pickup_released_at: null,
        status: "pending",
        fulfillment_note: note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipmentId)
      .eq("carrier", "uber_direct")
      .is("uber_delivery_id", null)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error(
        "[uber-direct][auditoria] nao conseguiu reverter pickup_released_at",
        { shipmentId },
        error,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[uber-direct][auditoria] excecao ao reverter pickup_released_at", { shipmentId }, err);
    return false;
  }
}

async function notifyAdmins(type: string, title: string, message: string): Promise<void> {
  const admin = createAdminClient();
  try {
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
    if (admins && admins.length > 0) {
      await admin
        .from("notifications")
        .insert(admins.map((a) => ({ user_id: a.id, type, title, message })));
    }
  } catch (err) {
    console.error("[uber-direct][auditoria] falha ao notificar admin", { type }, err);
  }
}

async function runExpressDispatch(orderId: string, storeId: string): Promise<ExpressDispatchOutcome> {
  const admin = createAdminClient();

  const { data: shipment } = await admin
    .from("shipments")
    .select("id, status, carrier, price, pickup_released_at, uber_delivery_id")
    .eq("order_id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!shipment || shipment.carrier !== "uber_direct" || shipment.status !== "pending") {
    return { kind: "skipped" };
  }

  // Defesa em profundidade: sem a liberacao da artesa (ou com corrida ja
  // criada) nunca chama a Uber, mesmo que alguem invoque esta funcao direto.
  if (!shipment.pickup_released_at || shipment.uber_delivery_id) {
    console.warn("[uber-direct][auditoria] despacho ignorado: retirada nao liberada ou corrida ja existe", {
      orderId,
      storeId,
    });
    return { kind: "skipped" };
  }

  // Leituras de preparo: falhar aqui e anterior a qualquer chamada na Uber,
  // entao e seguro devolver a liberacao pra artesa tentar de novo.
  const abortBeforeUber = async (what: string): Promise<ExpressDispatchOutcome> => {
    console.error("[uber-direct][auditoria] despacho abortado antes da Uber", { orderId, storeId, what });
    const ok = await resetRelease(shipment.id, "Despacho abortado antes da Uber: " + what + ".");
    return ok ? { kind: "retry_later" } : { kind: "unconfirmed" };
  };

  const { data: order } = await admin
    .from("orders")
    .select(
      "shipping_name, shipping_phone, shipping_cep, shipping_street, shipping_number, shipping_complement, shipping_neighborhood, shipping_city, shipping_state",
    )
    .eq("id", orderId)
    .single();
  if (!order) return abortBeforeUber("pedido nao encontrado");

  const { data: store } = await admin
    .from("stores")
    .select("name, cep, address_street, address_number, address_neighborhood, city, state")
    .eq("id", storeId)
    .single();
  if (!store) return abortBeforeUber("loja nao encontrada");

  const { data: items } = await admin
    .from("order_items")
    .select("quantity, unit_price, product:products(name, height_cm, width_cm, length_cm, weight_grams)")
    .eq("order_id", orderId)
    .eq("store_id", storeId);
  if (!items || items.length === 0) return abortBeforeUber("itens do pedido nao encontrados");

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
    const product = item.product as unknown as {
      name: string;
      height_cm: number | null;
      width_cm: number | null;
      length_cm: number | null;
      weight_grams: number | null;
    } | null;

    // Dimensões e peso só vão juntos e completos; produto sem eles segue como
    // "small" sem dimensões (a Uber assume o pacote pequeno padrão).
    const hasPackage = !!(product?.height_cm && product.width_cm && product.length_cm && product.weight_grams);

    return {
      name: product?.name ?? "Produto",
      quantity: item.quantity,
      priceCents: Math.round(item.unit_price * 100),
      ...(hasPackage
        ? {
            dimensionsCm: {
              length: Math.ceil(product!.length_cm!),
              height: Math.ceil(product!.height_cm!),
              depth: Math.ceil(product!.width_cm!),
            },
            weightGrams: Math.round(product!.weight_grams!),
          }
        : {}),
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

  const paidPrice = shipment.price ?? 0;

  // 1) Cotacao. Qualquer falha aqui e DEFINITIVA: nenhuma entrega foi pedida.
  let quoteId: string;
  let quotedFeeCents: number;
  try {
    // A cotacao do checkout nao serve mais: quote_id da Uber tem validade curta
    // e a liberacao acontece quando a artesa embalou (pode ser horas depois do
    // pagamento). Recota agora e usa o quote_id novo.
    const quote = await getDeliveryQuote(pickupAddress, dropoffAddress);
    if (!quote.id) {
      throw new Error("cotacao da Uber Direct veio sem quote_id");
    }
    if (quote.currency.toLowerCase() !== "brl") {
      throw new Error("cotacao da Uber Direct veio em " + quote.currency);
    }
    quoteId = quote.id;
    quotedFeeCents = quote.fee;
  } catch (err) {
    return handleDispatchFailure({
      orderId,
      storeId,
      shipmentId: shipment.id,
      paidPrice,
      error: err,
      ambiguous: false,
    });
  }

  // 2) Teto na recotacao. O comprador ja pagou o frete cotado no checkout:
  // dentro da tolerancia a plataforma absorve a diferenca; acima dela a corrida
  // nao e criada (nao da pra cobrar de novo).
  const paidCents = Math.round(paidPrice * 100);
  const diffCents = quotedFeeCents - paidCents;
  if (diffCents > EXPRESS_REQUOTE_TOLERANCE_CENTS) {
    console.warn("[uber-direct][auditoria] recotacao acima do frete pago + tolerancia — corrida nao criada", {
      orderId,
      storeId,
      paidCents,
      quotedCents: quotedFeeCents,
      toleranceCents: EXPRESS_REQUOTE_TOLERANCE_CENTS,
    });

    const reset = await resetRelease(
      shipment.id,
      "recotação acima do frete pago (pago R$" + (paidCents / 100).toFixed(2) +
        ", recotado R$" + (quotedFeeCents / 100).toFixed(2) + ", tolerância R$" +
        (EXPRESS_REQUOTE_TOLERANCE_CENTS / 100).toFixed(2) + ").",
    );

    await notifyAdmins(
      "recotacao_expressa_acima_do_frete",
      "Entrega expressa não despachada: recotação acima do frete",
      "Pedido " + orderId.slice(0, 8) + " (loja " + storeId.slice(0, 8) + "): frete pago R$" +
        (paidCents / 100).toFixed(2) + ", recotação R$" + (quotedFeeCents / 100).toFixed(2) +
        ". A corrida não foi criada e a retirada voltou pra loja.",
    );

    return reset ? { kind: "requote_too_high" } : { kind: "unconfirmed" };
  }

  if (diffCents > 1) {
    console.warn("[uber-direct] frete recotado acima do pago, dentro da tolerancia (plataforma absorve)", {
      orderId,
      storeId,
      paidCents,
      quotedCents: quotedFeeCents,
      absorbedCents: diffCents,
    });
  }

  // 3) Criacao da corrida. Daqui em diante a Uber pode ter criado a entrega.
  let delivery: Awaited<ReturnType<typeof createDelivery>>;
  try {
    delivery = await createDelivery(
      quoteId,
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
  } catch (err) {
    return handleDispatchFailure({
      orderId,
      storeId,
      shipmentId: shipment.id,
      paidPrice,
      error: err,
      ambiguous: isAmbiguousDeliveryError(err),
    });
  }

  // 4) Gravacao FORA do try do createDelivery: a corrida ja existe, entao uma
  // falha de banco aqui nunca pode cair no tratamento de "despacho falhou"
  // (fallback / reversao da liberacao).
  const { error: saveError } = await admin
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

  if (saveError) {
    console.error(
      "[uber-direct][auditoria] corrida CRIADA mas nao gravada no shipment — conferir manualmente",
      { orderId, storeId, shipmentId: shipment.id, uberDeliveryId: delivery.id },
      saveError,
    );
    return { kind: "unconfirmed" };
  }

  return { kind: "dispatched" };
}

/**
 * A entrega expressa nao saiu. O pedido nao pode travar nem inventar sucesso:
 *
 * - AMBIGUO (a corrida pode existir): nao tenta fallback, nao reverte a
 *   liberacao; so registra. Reverter/trocar aqui poderia gerar duas entregas.
 * - DEFINITIVO: tenta fallback automatico pro Melhor Envio — so aceita um
 *   servico que custe ate o que o comprador JA pagou. Sem fallback viavel, a
 *   liberacao volta pra NULL (o botao reaparece) com o motivo em
 *   fulfillment_note.
 */
async function handleDispatchFailure(params: {
  orderId: string;
  storeId: string;
  shipmentId: string;
  paidPrice: number;
  error: unknown;
  ambiguous: boolean;
}): Promise<ExpressDispatchOutcome> {
  const admin = createAdminClient();
  const detail = params.error instanceof Error ? params.error.message : String(params.error);

  console.error(
    "[uber-direct][auditoria] despacho expresso falhou (" + (params.ambiguous ? "AMBIGUO" : "definitivo") + ")",
    { orderId: params.orderId, storeId: params.storeId, shipmentId: params.shipmentId },
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

  if (params.ambiguous) {
    await markManual(
      "Resposta ambigua da Uber ao criar a entrega (" + detail + "). A corrida pode ter sido criada — conferir no painel da Uber antes de qualquer nova tentativa.",
    );
    return { kind: "unconfirmed" };
  }

  // Definitivo. Primeiro tenta o Melhor Envio.
  let fallback: FallbackService | null = null;
  try {
    fallback = await findMelhorEnvioFallback(params.orderId, params.storeId, params.paidPrice);
  } catch (err) {
    console.error(
      "[uber-direct][auditoria] busca de fallback do Melhor Envio falhou",
      { orderId: params.orderId, storeId: params.storeId },
      err,
    );
  }

  if (!fallback) {
    const reset = await resetRelease(
      params.shipmentId,
      "Entrega expressa falhou (" + detail + "). Sem alternativa do Melhor Envio dentro do frete ja pago — retirada devolvida a loja pra nova tentativa.",
    );
    return reset ? { kind: "retry_later" } : { kind: "unconfirmed" };
  }

  // Troca de transportadora mantendo o preco que o comprador pagou: o
  // service_id passa a ser o do Melhor Envio, entao purchaseLabelForShipment
  // consegue comprar a etiqueta normalmente.
  const { error: switchError } = await admin
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
    .eq("id", params.shipmentId)
    .is("uber_delivery_id", null);

  if (switchError) {
    console.error(
      "[uber-direct][auditoria] nao conseguiu trocar pra Melhor Envio",
      { shipmentId: params.shipmentId },
      switchError,
    );
    const reset = await resetRelease(
      params.shipmentId,
      "Entrega expressa falhou (" + detail + ") e a troca pro Melhor Envio nao gravou — retirada devolvida a loja.",
    );
    return reset ? { kind: "retry_later" } : { kind: "unconfirmed" };
  }

  try {
    await purchaseLabelForShipment(params.orderId, params.storeId);
  } catch (err) {
    console.error(
      "[uber-direct][auditoria] compra da etiqueta do fallback falhou",
      { orderId: params.orderId, storeId: params.storeId },
      err,
    );
    await markManual(
      "Entrega expressa falhou (" + detail + ") e a etiqueta do Melhor Envio nao pode ser comprada — precisa de tratamento manual.",
    );
  }

  return { kind: "fallback_melhorenvio" };
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
