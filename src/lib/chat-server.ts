// Helpers de servidor do chat (NÃO é um arquivo "use server": nada aqui vira
// endpoint). Usados pelas actions de mensagens e de moderação.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface ChatConversation {
  id: string;
  buyerId: string;
  storeId: string;
  storeOwnerId: string;
  storeName: string;
  orderId: string | null;
}

/**
 * Carrega a conversa com o client recebido. Com o client do usuário, a RLS já
 * esconde o que não é dele; a checagem de participante abaixo é a segunda
 * barreira (e a mensagem de erro é a mesma pra "não existe" e "não é seu").
 */
export async function loadConversationForUser(
  client: Client,
  conversationId: string,
  userId: string,
): Promise<ChatConversation | null> {
  if (!isUuid(conversationId)) return null;

  const { data } = await client
    .from("conversations")
    .select("id, buyer_id, store_id, order_id, store:stores(name, owner_id)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return null;

  const store = Array.isArray(data.store) ? data.store[0] : data.store;
  if (!store) return null;

  const isParticipant = data.buyer_id === userId || store.owner_id === userId;
  if (!isParticipant) return null;

  return {
    id: data.id,
    buyerId: data.buyer_id,
    storeId: data.store_id,
    storeOwnerId: store.owner_id,
    storeName: store.name,
    orderId: data.order_id,
  };
}

/** O outro lado da conversa: o comprador vê o dono da loja e vice-versa. */
export function otherParticipantId(conversation: ChatConversation, userId: string): string {
  return conversation.buyerId === userId ? conversation.storeOwnerId : conversation.buyerId;
}

/** Existe bloqueio em qualquer direção? Só com o client admin (a tabela é RLS por dono). */
export async function isBlockedBetween(admin: Client, a: string, b: string): Promise<boolean> {
  const { data } = await admin
    .from("chat_blocks")
    .select("id")
    .or(
      `and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`,
    )
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export function chatLink(conversationId: string): string {
  return `/mensagens?conversa=${conversationId}`;
}
