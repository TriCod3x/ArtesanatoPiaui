"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { reviewSchema, type ReviewInput } from "@/lib/validations";

/**
 * Cria uma avaliação de produto. Repete no servidor a mesma elegibilidade
 * da policy `reviews_insert_eligible_buyer` (comprou, item entregue, não é
 * dono da loja) pra devolver uma mensagem clara antes de tentar o insert —
 * a policy continua sendo a garantia final.
 */
export async function createReview(orderItemId: string, input: ReviewInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { data: orderItem } = await supabase
    .from("order_items")
    .select("id, item_status, product_id, store_id, order:orders(buyer_id)")
    .eq("id", orderItemId)
    .maybeSingle();

  if (!orderItem) return { error: "Item do pedido não encontrado." };

  const order = orderItem.order as unknown as { buyer_id: string } | null;
  if (!order || order.buyer_id !== user.id) {
    return { error: "Você só pode avaliar produtos dos seus próprios pedidos." };
  }
  if (orderItem.item_status !== "delivered") {
    return { error: "Você só pode avaliar depois que o item for entregue." };
  }

  const { data: store } = await supabase
    .from("stores")
    .select("owner_id")
    .eq("id", orderItem.store_id)
    .maybeSingle();
  if (store?.owner_id === user.id) {
    return { error: "Você não pode avaliar sua própria loja." };
  }

  const { error } = await supabase.from("reviews").insert({
    buyer_id: user.id,
    order_item_id: orderItem.id,
    product_id: orderItem.product_id,
    store_id: orderItem.store_id,
    rating: parsed.data.rating,
    comment: parsed.data.comment || null,
  });

  if (error) {
    if (error.code === "23505") return { error: "Você já avaliou este item." };
    return { error: "Não foi possível registrar sua avaliação. Tente novamente." };
  }

  revalidatePath("/pedidos");
  return { success: true };
}
