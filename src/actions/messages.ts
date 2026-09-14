"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConversationSummary } from "@/types";

/**
 * Retorna a conversa existente entre o comprador logado e a loja, ou cria
 * uma nova (uma conversa por par comprador+loja, independente do produto).
 */
export async function getOrCreateConversation(storeId: string, productId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" as const };

  const { data: store } = await supabase
    .from("stores")
    .select("id, owner_id")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) return { error: "Loja não encontrada." };
  if (store.owner_id === user.id) {
    return { error: "Você não pode enviar mensagem para sua própria loja." };
  }

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("store_id", storeId)
    .eq("buyer_id", user.id)
    .maybeSingle();

  if (existing) return { conversationId: existing.id };

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ store_id: storeId, buyer_id: user.id, product_id: productId ?? null })
    .select("id")
    .single();

  if (error || !created) return { error: "Erro ao iniciar conversa. Tente novamente." };
  return { conversationId: created.id };
}

/** Envia uma mensagem; valida que o remetente participa da conversa. */
export async function sendMessage(conversationId: string, content: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const trimmed = content.trim();
  if (!trimmed) return { error: "A mensagem não pode estar vazia." };

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, buyer_id, store:stores(owner_id)")
    .eq("id", conversationId)
    .maybeSingle();

  const store = Array.isArray(conversation?.store) ? conversation.store[0] : conversation?.store;
  const isParticipant =
    !!conversation && (conversation.buyer_id === user.id || store?.owner_id === user.id);

  if (!isParticipant) return { error: "Você não faz parte desta conversa." };

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: trimmed,
  });

  if (error) return { error: "Erro ao enviar mensagem. Tente novamente." };

  // Não há policy de UPDATE em `conversations` pro participante comum
  // (só INSERT/SELECT) — o bump de last_message_at roda via service role.
  const admin = createAdminClient();
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  revalidatePath("/mensagens");
  return { success: true as const };
}

/** Marca como lidas as mensagens da conversa que não foram enviadas por mim. */
export async function markAsRead(conversationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .is("read_at", null)
    .neq("sender_id", user.id);

  if (error) return { error: "Erro ao marcar como lida." };

  revalidatePath("/mensagens");
  return { success: true as const };
}

/** Total de mensagens não lidas do usuário logado, pra badge no header. */
export async function getUnreadMessagesCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .neq("sender_id", user.id);

  return count ?? 0;
}

type ConversationRow = {
  id: string;
  buyer_id: string;
  store_id: string;
  last_message_at: string;
  store: { name: string; slug: string; logo_url: string | null } | { name: string; slug: string; logo_url: string | null }[] | null;
  buyer: { full_name: string; avatar_url: string | null } | { full_name: string; avatar_url: string | null }[] | null;
  product: { name: string } | { name: string }[] | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};

/**
 * Lista as conversas do usuário logado (como comprador OU dono de loja),
 * com nome do outro participante, última mensagem e contagem de não lidas.
 */
export async function getConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: myStore } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  let query = supabase
    .from("conversations")
    .select(
      `
      id, buyer_id, store_id, last_message_at,
      store:stores(name, slug, logo_url),
      buyer:profiles!conversations_buyer_id_fkey(full_name, avatar_url),
      product:products(name)
      `,
    )
    .order("last_message_at", { ascending: false });

  query = myStore
    ? query.or(`buyer_id.eq.${user.id},store_id.eq.${myStore.id}`)
    : query.eq("buyer_id", user.id);

  const { data } = await query;
  const conversations = (data ?? []) as unknown as ConversationRow[];
  if (conversations.length === 0) return [];

  const ids = conversations.map((c) => c.id);
  const { data: messagesData } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, content, read_at, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });
  const messages = (messagesData ?? []) as MessageRow[];

  const lastMessageByConv = new Map<string, MessageRow>();
  const unreadCountByConv = new Map<string, number>();
  for (const m of messages) {
    if (!lastMessageByConv.has(m.conversation_id)) {
      lastMessageByConv.set(m.conversation_id, m);
    }
    if (!m.read_at && m.sender_id !== user.id) {
      unreadCountByConv.set(m.conversation_id, (unreadCountByConv.get(m.conversation_id) ?? 0) + 1);
    }
  }

  return conversations.map((c) => {
    const iAmBuyer = c.buyer_id === user.id;
    const store = Array.isArray(c.store) ? c.store[0] : c.store;
    const buyer = Array.isArray(c.buyer) ? c.buyer[0] : c.buyer;
    const product = Array.isArray(c.product) ? c.product[0] : c.product;
    const last = lastMessageByConv.get(c.id);

    return {
      id: c.id,
      iAmBuyer,
      storeId: c.store_id,
      storeSlug: store?.slug ?? "",
      otherName: iAmBuyer ? (store?.name ?? "Loja") : (buyer?.full_name ?? "Comprador"),
      otherAvatar: iAmBuyer ? (store?.logo_url ?? null) : (buyer?.avatar_url ?? null),
      productName: product?.name ?? null,
      lastMessage: last?.content ?? null,
      lastMessageAt: c.last_message_at,
      unreadCount: unreadCountByConv.get(c.id) ?? 0,
    };
  });
}
