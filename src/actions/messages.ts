"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GENERIC_SEND_ERROR,
  REPORT_AUDIT_WINDOW_MS,
  buildReportSnapshot,
  canReportAgain,
  classifyChatDbError,
  countDistinctReporters,
  isReportReason,
  normalizeReportDetails,
  shouldAlertAdmins,
  validateMessageContent,
} from "@/lib/chat";
import {
  chatLink,
  isBlockedBetween,
  isUuid,
  loadConversationForUser,
  otherParticipantId,
} from "@/lib/chat-server";
import type { Json } from "@/types/database";
import type { ConversationSummary } from "@/types";
import type {
  ChatActionResult,
  ReportConversationResult,
  StartConversationResult,
} from "@/types/actions";

const UNAUTHENTICATED = { error: "Não autenticado.", unauthenticated: true as const };
const NOT_PARTICIPANT = "Você não faz parte desta conversa.";
const GENERIC_START_ERROR = "Não foi possível iniciar a conversa agora.";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Inicia (ou reaproveita) a conversa do comprador logado com a loja. Uma
 * conversa por (comprador, loja, produto); sem produto, uma por (comprador,
 * loja). Só o comprador inicia; tudo é validado aqui E pela RLS/triggers.
 */
export async function startConversation(
  storeId: string,
  productId?: string,
  orderId?: string,
): Promise<StartConversationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return UNAUTHENTICATED;

  if (!isUuid(storeId)) return { error: "Loja não encontrada." };
  if (productId != null && !isUuid(productId)) return { error: "Produto não encontrado nesta loja." };
  if (orderId != null && !isUuid(orderId)) return { error: "Pedido não encontrado." };

  const { data: store } = await supabase
    .from("stores")
    .select("id, owner_id")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) return { error: "Loja não encontrada." };
  if (store.owner_id === user.id) {
    return { error: "Você não pode enviar mensagem para sua própria loja." };
  }

  const admin = createAdminClient();

  // Falha genérica de propósito: quem foi bloqueado não pode saber.
  if (await isBlockedBetween(admin, user.id, store.owner_id)) {
    return { error: GENERIC_START_ERROR };
  }

  if (productId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (!product) return { error: "Produto não encontrado nesta loja." };
  }

  if (orderId) {
    const { data: orderItem } = await supabase
      .from("order_items")
      .select("id, order:orders!inner(buyer_id)")
      .eq("order_id", orderId)
      .eq("store_id", storeId)
      .eq("order.buyer_id", user.id)
      .limit(1);
    if (!orderItem || orderItem.length === 0) {
      return { error: "Pedido não encontrado nesta loja." };
    }
  }

  const findExisting = async () => {
    let query = supabase
      .from("conversations")
      .select("id, order_id")
      .eq("buyer_id", user.id)
      .eq("store_id", storeId);
    query = productId ? query.eq("product_id", productId) : query.is("product_id", null);
    const { data } = await query.maybeSingle();
    return data;
  };

  // Reaproveita; se veio de um pedido, a conversa passa a apontar pra ele
  // (o comprador não tem UPDATE em conversations, então vai pelo service role,
  // depois de validado acima).
  const reuse = async (existing: { id: string; order_id: string | null }) => {
    if (orderId && existing.order_id !== orderId) {
      await admin.from("conversations").update({ order_id: orderId }).eq("id", existing.id);
    }
    return { conversationId: existing.id };
  };

  const existing = await findExisting();
  if (existing) return reuse(existing);

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      store_id: storeId,
      buyer_id: user.id,
      product_id: productId ?? null,
      order_id: orderId ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    // Corrida: duas abas criando a mesma conversa — a outra venceu.
    if (error?.code === "23505") {
      const raced = await findExisting();
      if (raced) return reuse(raced);
    }
    if (classifyChatDbError(error) === "rate_limit_conversations") {
      return { error: "Você iniciou muitas conversas hoje. Tente novamente amanhã." };
    }
    return { error: GENERIC_START_ERROR };
  }

  return { conversationId: created.id };
}

/** Envia uma mensagem; valida que o remetente participa da conversa. */
export async function sendMessage(conversationId: string, content: string): Promise<ChatActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return UNAUTHENTICATED;

  const validated = validateMessageContent(content);
  if (!validated.ok) return { error: validated.error };

  const conversation = await loadConversationForUser(supabase, conversationId, user.id);
  if (!conversation) return { error: NOT_PARTICIPANT };

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      sender_id: user.id,
      content: validated.content,
    })
    .select("id, created_at")
    .single();

  if (error || !inserted) {
    // Limite de envio, bloqueio (RLS) e qualquer outra falha viram a mesma
    // mensagem genérica; só o chat desativado pela moderação é dito.
    if (classifyChatDbError(error) === "disabled") {
      return { error: "O chat da sua conta está desativado." };
    }
    return { error: GENERIC_SEND_ERROR };
  }

  // Não há policy/grant de UPDATE em `conversations` pro participante: o bump
  // de last_message_at roda via service role, depois da checagem acima.
  const admin = createAdminClient();
  await admin
    .from("conversations")
    .update({ last_message_at: inserted.created_at })
    .eq("id", conversation.id);

  await notifyNewMessage(admin, {
    conversation,
    senderId: user.id,
  });

  revalidatePath("/mensagens");
  return { success: true as const };
}

/**
 * Notifica o destinatário — só se ele ainda não tiver notificação NÃO lida
 * dessa conversa (evita uma notificação por mensagem). Nunca derruba o envio.
 */
async function notifyNewMessage(
  admin: AdminClient,
  params: {
    conversation: NonNullable<Awaited<ReturnType<typeof loadConversationForUser>>>;
    senderId: string;
  },
) {
  try {
    const { conversation, senderId } = params;
    const recipientId = otherParticipantId(conversation, senderId);
    const link = chatLink(conversation.id);

    const { data: existing } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", recipientId)
      .eq("type", "nova_mensagem")
      .eq("link", link)
      .is("read_at", null)
      .limit(1);
    if (existing && existing.length > 0) return;

    let senderName = conversation.storeName;
    if (senderId === conversation.buyerId) {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", senderId)
        .maybeSingle();
      senderName = profile?.full_name?.trim() || "Um comprador";
    }

    await admin.from("notifications").insert({
      user_id: recipientId,
      type: "nova_mensagem",
      title: "Nova mensagem",
      message: `${senderName} enviou uma mensagem`,
      link,
    });
  } catch (err) {
    console.error("[chat] falha ao notificar nova mensagem", err);
  }
}

/** Marca como lidas as mensagens da conversa que não foram enviadas por mim. */
export async function markConversationRead(conversationId: string): Promise<ChatActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return UNAUTHENTICATED;

  if (!isUuid(conversationId)) return { error: NOT_PARTICIPANT };

  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .is("read_at", null)
    .neq("sender_id", user.id);

  if (error) return { error: "Erro ao marcar como lida." };

  // Sem isto, abrir a conversa sem passar pelo sino deixaria a notificação
  // "não lida" pra sempre e a regra de uma-por-conversa silenciaria as
  // próximas. Filtra por user_id (a RLS de notifications também).
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("type", "nova_mensagem")
    .eq("link", chatLink(conversationId))
    .is("read_at", null);

  revalidatePath("/mensagens");
  return { success: true as const };
}

async function setBlock(conversationId: string, block: boolean): Promise<ChatActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return UNAUTHENTICATED;

  const conversation = await loadConversationForUser(supabase, conversationId, user.id);
  if (!conversation) return { error: NOT_PARTICIPANT };

  const otherId = otherParticipantId(conversation, user.id);
  if (otherId === user.id) return { error: "Operação inválida." };

  if (block) {
    const { error } = await supabase
      .from("chat_blocks")
      .insert({ blocker_id: user.id, blocked_id: otherId });
    // 23505 = já bloqueado: o resultado desejado já vale.
    if (error && error.code !== "23505") {
      return { error: "Não foi possível bloquear agora. Tente novamente." };
    }
  } else {
    const { error } = await supabase
      .from("chat_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", otherId);
    if (error) return { error: "Não foi possível desbloquear agora. Tente novamente." };
  }

  revalidatePath("/mensagens");
  return { success: true as const };
}

/** Bloqueia o outro participante da conversa. */
export async function blockUser(conversationId: string): Promise<ChatActionResult> {
  return setBlock(conversationId, true);
}

/** Desbloqueia o outro participante da conversa. */
export async function unblockUser(conversationId: string): Promise<ChatActionResult> {
  return setBlock(conversationId, false);
}

/**
 * Denuncia a conversa. O snapshot (últimas 5 mensagens) é lido e gravado no
 * servidor com o service role — o cliente nunca manda o conteúdo.
 */
export async function reportConversation(
  conversationId: string,
  reason: string,
  details?: string,
  alsoBlock?: boolean,
): Promise<ReportConversationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return UNAUTHENTICATED;

  if (!isReportReason(reason)) return { error: "Escolha um motivo para a denúncia." };
  const normalizedDetails = normalizeReportDetails(details);
  if (!normalizedDetails.ok) return { error: normalizedDetails.error };

  const conversation = await loadConversationForUser(supabase, conversationId, user.id);
  if (!conversation) return { error: NOT_PARTICIPANT };

  const reportedId = otherParticipantId(conversation, user.id);
  const admin = createAdminClient();

  const { data: previous } = await admin
    .from("chat_reports")
    .select("status, created_at")
    .eq("reporter_id", user.id)
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!canReportAgain(previous ?? [])) {
    return { error: "Você já denunciou esta conversa. A equipe vai analisar." };
  }

  const { data: lastMessages } = await admin
    .from("messages")
    .select("id, sender_id, content, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: buyerProfile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", conversation.buyerId)
    .maybeSingle();

  const nameById = new Map<string, string>([
    [conversation.buyerId, buyerProfile?.full_name?.trim() || "Comprador"],
    [conversation.storeOwnerId, conversation.storeName],
  ]);
  const snapshot = buildReportSnapshot(lastMessages ?? [], nameById);

  const { error: insertError } = await admin.from("chat_reports").insert({
    reporter_id: user.id,
    reported_user_id: reportedId,
    conversation_id: conversation.id,
    reason,
    details: normalizedDetails.details,
    snapshot: snapshot as unknown as Json,
  });
  if (insertError) return { error: "Não foi possível enviar a denúncia agora. Tente novamente." };

  let blocked = false;
  if (alsoBlock === true) {
    const { error: blockError } = await admin
      .from("chat_blocks")
      .insert({ blocker_id: user.id, blocked_id: reportedId });
    blocked = !blockError || blockError.code === "23505";
  }

  await alertAdminsIfRepeatedReports(admin, reportedId);

  revalidatePath("/mensagens");
  return { success: true as const, blocked };
}

/**
 * 3 denunciantes DISTINTOS em 30 dias → UMA notificação de auditoria pros
 * admins (sem banir ninguém). Uma por denunciado por janela. Nunca derruba a
 * denúncia já gravada.
 */
async function alertAdminsIfRepeatedReports(admin: AdminClient, reportedId: string) {
  try {
    const since = new Date(Date.now() - REPORT_AUDIT_WINDOW_MS).toISOString();

    const { data: recent } = await admin
      .from("chat_reports")
      .select("reporter_id")
      .eq("reported_user_id", reportedId)
      .gte("created_at", since);
    if (!shouldAlertAdmins(countDistinctReporters(recent ?? []))) return;

    const link = `/admin/denuncias?denunciado=${reportedId}`;
    const { data: already } = await admin
      .from("notifications")
      .select("id")
      .eq("type", "denuncia_chat_auditoria")
      .eq("link", link)
      .gte("created_at", since)
      .limit(1);
    if (already && already.length > 0) return;

    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
    if (!admins || admins.length === 0) return;

    await admin.from("notifications").insert(
      admins.map((a) => ({
        user_id: a.id,
        type: "denuncia_chat_auditoria",
        title: "Usuário com várias denúncias no chat",
        message: "Um usuário recebeu denúncias de 3 pessoas diferentes nos últimos 30 dias.",
        link,
      })),
    );
  } catch (err) {
    console.error("[chat] falha ao criar alerta de auditoria", err);
  }
}

/** Total de mensagens não lidas do usuário logado, pra badge no menu. */
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
