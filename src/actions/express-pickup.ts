"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchExpressDelivery } from "@/lib/uber-direct-dispatch";

export type ReleaseExpressPickupResult =
  | { error: string }
  | { success: true; alreadyReleased?: boolean; fallbackToMelhorEnvio?: boolean };

/**
 * A artesã clicou em "Pronto pra retirada": só agora a corrida da Uber Direct
 * é criada (o settlePayment não chama mais a Uber).
 *
 * Ordem (cada passo barra o seguinte):
 * 1. login;
 * 2. dono da loja do shipment, conferido com o client comum (RLS) — o
 *    shipmentId vem do cliente e não é confiável;
 * 3. shipment uber_direct, 'pending', e pagamento DA LOJA 'paid';
 * 4. reivindicação ATÔMICA de pickup_released_at. Dois cliques (ou duas
 *    abas) viram duas requisições; só uma recebe a linha de volta e segue
 *    pra Uber — a outra devolve "já liberado" sem custo. Sem isso, clique
 *    duplo = duas corridas cobradas;
 * 5. dispatchExpressDelivery (recotação + teto + createDelivery + fallback
 *    Melhor Envio), sem checar horário: quem decide que está pronto é a
 *    artesã. Falha DEFINITIVA devolve a liberação (pickup_released_at volta a
 *    NULL e o botão reaparece); erro AMBÍGUO a mantém, porque a corrida pode
 *    existir.
 */
export async function releaseExpressPickup(shipmentId: string): Promise<ReleaseExpressPickupResult> {
  if (typeof shipmentId !== "string" || shipmentId.length === 0) {
    return { error: "Envio inválido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const admin = createAdminClient();

  const { data: shipment } = await admin
    .from("shipments")
    .select("id, order_id, store_id, carrier, status, uber_delivery_id, pickup_released_at")
    .eq("id", shipmentId)
    .maybeSingle();
  if (!shipment) return { error: "Envio não encontrado." };

  // Mesmo padrão de /minha-loja/pedidos: a posse é confirmada pela sessão
  // (RLS de stores), e só depois o admin client age sobre o shipment.
  const { data: ownedStore } = await supabase
    .from("stores")
    .select("id")
    .eq("id", shipment.store_id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!ownedStore) return { error: "Envio não encontrado." };

  if (shipment.carrier !== "uber_direct") return { error: "Este envio não é uma entrega expressa." };

  // Já liberado antes (clique duplo, aba antiga): não é erro, e não chama a Uber.
  if (shipment.pickup_released_at || shipment.uber_delivery_id) {
    return { success: true, alreadyReleased: true };
  }
  if (shipment.status !== "pending") return { error: "Este envio não está aguardando retirada." };

  const { data: payment } = await admin
    .from("payments")
    .select("status")
    .eq("order_id", shipment.order_id)
    .eq("store_id", shipment.store_id)
    .maybeSingle();
  if (payment?.status !== "paid") return { error: "O pagamento deste pedido ainda não foi confirmado." };

  const { data: order } = await admin.from("orders").select("status").eq("id", shipment.order_id).maybeSingle();
  if (!order || order.status === "cancelled") return { error: "Este pedido foi cancelado." };

  // Reivindicação atômica: o WHERE é o lock.
  const { data: claimed, error: claimError } = await admin
    .from("shipments")
    .update({ pickup_released_at: new Date().toISOString() })
    .eq("id", shipment.id)
    .eq("status", "pending")
    .is("pickup_released_at", null)
    .is("uber_delivery_id", null)
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("[uber-direct][auditoria] falha ao reivindicar liberação da retirada", { shipmentId }, claimError);
    return { error: "Não foi possível liberar a retirada agora. Tente novamente." };
  }
  if (!claimed) {
    // Outra requisição reivindicou primeiro. NÃO chama a Uber.
    return { success: true, alreadyReleased: true };
  }

  // Nunca lança (contrato do dispatchExpressDelivery).
  const outcome = await dispatchExpressDelivery(shipment.order_id, shipment.store_id);

  revalidatePath("/minha-loja/pedidos");

  switch (outcome.kind) {
    case "dispatched":
      return { success: true };
    case "fallback_melhorenvio":
      return { success: true, fallbackToMelhorEnvio: true };
    case "retry_later":
      return { error: "Não conseguimos chamar o motorista agora. Tente de novo em alguns minutos." };
    case "requote_too_high":
      return { error: "Entrega expressa indisponível no momento. Tente de novo mais tarde." };
    case "unconfirmed":
    case "skipped":
    default:
      // A corrida pode ter sido criada sem a gente saber: a liberação fica
      // registrada e o botão não volta (evita corrida duplicada).
      return {
        error:
          "Não conseguimos confirmar o motorista da entrega expressa. A retirada ficou registrada como liberada — não tente de novo; entre em contato com o suporte.",
      };
  }
}
