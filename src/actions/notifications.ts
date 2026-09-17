"use server";

import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/types";

const RECENT_LIMIT = 20;

/** Lista as notificações do usuário logado, mais recentes primeiro. */
export async function getNotifications(): Promise<Notification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);

  return data ?? [];
}

/** Total de notificações não lidas do usuário logado, pra badge no sino. */
export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return count ?? 0;
}

/** Marca uma notificação como lida; valida que ela pertence ao usuário logado. */
export async function markAsRead(notificationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return { error: "Erro ao marcar notificação como lida." };
  return { success: true as const };
}

/** Marca todas as notificações não lidas do usuário logado como lidas. */
export async function markAllAsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return { error: "Erro ao marcar notificações como lidas." };
  return { success: true as const };
}
