"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IDENTITY_DOCUMENTS_BUCKET, SIGNED_URL_TTL } from "@/lib/constants";
import { isReportReason, isReportResolutionStatus, type ReportReason, type ReportSnapshotEntry } from "@/lib/chat";
import { isUuid } from "@/lib/chat-server";
import type { ChatReportItem, ListReportsResult } from "@/types/actions";
import type { User } from "@supabase/supabase-js";

async function requireAdmin(): Promise<
  { user: User } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { error: "Acesso restrito." };
  return { user };
}

/**
 * Gera uma signed URL temporária para o documento de identidade de um vendedor.
 * O bucket é privado — a URL pública nunca é usada. Somente admin.
 */
export async function getSellerDocumentUrl(userId: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();

  const { data: verification } = await admin
    .from("seller_verifications")
    .select("id_document_path")
    .eq("user_id", userId)
    .maybeSingle();

  if (!verification?.id_document_path) {
    return { error: "Documento não encontrado." };
  }

  const { data, error } = await admin.storage
    .from(IDENTITY_DOCUMENTS_BUCKET)
    .createSignedUrl(verification.id_document_path, SIGNED_URL_TTL);

  if (error || !data?.signedUrl) {
    return { error: "Não foi possível gerar o link do documento." };
  }

  return { url: data.signedUrl };
}

/**
 * Promove o usuário a vendedor nos DOIS lugares onde o papel é lido:
 * - `profiles.role`, usado pelas policies de RLS e pelas páginas;
 * - `user_metadata.role` (auth.users), que é o que o proxy.ts lê pra liberar
 *   /minha-loja/* e /dashboard — sem esse, a rota continua bloqueada.
 *
 * Só o signUp escrevia role="seller", e ele é pulado pra quem já tinha conta
 * de comprador: esse usuário fazia o KYC inteiro, tinha o documento aprovado
 * e continuava `buyer`, sendo redirecionado em silêncio pra home.
 *
 * Não rebaixa admin: um admin com documento aprovado continua admin.
 */
async function promoteToSeller(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<{ error: string } | { success: true }> {
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.role === "admin") return { success: true };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "seller" })
    .eq("id", userId);

  if (profileError) {
    console.error(`[admin] falha ao promover profiles.role de ${userId}:`, profileError);
    return { error: "profiles.role" };
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { role: "seller" },
  });

  if (metadataError) {
    console.error(`[admin] falha ao promover user_metadata.role de ${userId}:`, metadataError);
    return { error: "user_metadata.role" };
  }

  return { success: true };
}

export async function approveSellerDocument(userId: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("seller_verifications")
    .update({
      document_status: "approved",
      rejection_reason: null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.user.id,
    })
    .eq("user_id", userId);

  if (error) return { error: "Erro ao aprovar o documento." };

  // Roda sempre que o documento é aprovado, não só no primeiro cadastro: é
  // justamente o comprador que virou vendedor que chega aqui ainda como
  // `buyer`. Reaprovar um documento já aprovado é idempotente.
  const promotion = await promoteToSeller(admin, userId);
  if ("error" in promotion) {
    // O documento JÁ foi aprovado acima; só a promoção falhou. A mensagem diz
    // o que ficou pendente pro admin poder reaprovar (a operação se repete
    // sem efeito colateral) em vez de achar que deu tudo certo.
    return {
      error: `Documento aprovado, mas não foi possível liberar o acesso de vendedor (${promotion.error}). Aprove novamente para tentar de novo.`,
    };
  }

  revalidatePath("/admin/lojas");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function rejectSellerDocument(userId: string, reason?: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("seller_verifications")
    .update({
      document_status: "rejected",
      rejection_reason: reason?.trim() || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.user.id,
    })
    .eq("user_id", userId);

  if (error) return { error: "Erro ao rejeitar o documento." };

  revalidatePath("/admin/lojas");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Aprova a loja em si (stores.status: pending -> active). Só é permitido
 * quando o documento de identidade do dono já foi aprovado — a aprovação de
 * loja não pode "pular" a verificação de identidade.
 */
export async function approveStore(storeId: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();

  const { data: store } = await admin
    .from("stores")
    .select("id, slug, owner_id")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) return { error: "Loja não encontrada." };

  const { data: verification } = await admin
    .from("seller_verifications")
    .select("document_status")
    .eq("user_id", store.owner_id)
    .maybeSingle();

  if (verification?.document_status !== "approved") {
    return { error: "Documento de identidade ainda não foi aprovado." };
  }

  const { error } = await admin
    .from("stores")
    .update({ status: "active", rejection_reason: null })
    .eq("id", storeId);

  if (error) return { error: "Erro ao aprovar a loja." };

  revalidatePath("/admin/lojas");
  revalidatePath("/dashboard");
  revalidatePath("/lojas");
  revalidatePath(`/lojas/${store.slug}`);
  revalidatePath("/");
  return { success: true };
}

/** Rejeita/suspende a loja (stores.status = 'suspended'), com motivo opcional. */
export async function rejectStore(storeId: string, reason?: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();

  const { data: store } = await admin
    .from("stores")
    .select("slug")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) return { error: "Loja não encontrada." };

  const { error } = await admin
    .from("stores")
    .update({ status: "suspended", rejection_reason: reason?.trim() || null })
    .eq("id", storeId);

  if (error) return { error: "Erro ao rejeitar a loja." };

  revalidatePath("/admin/lojas");
  revalidatePath("/dashboard");
  revalidatePath("/lojas");
  revalidatePath(`/lojas/${store.slug}`);
  revalidatePath("/");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Moderação do chat (denúncias). Todas checam o papel admin NO BANCO
// (requireAdmin) e usam o service role: o admin não tem SELECT em messages,
// só vê o snapshot gravado na denúncia.
// ---------------------------------------------------------------------------

/** Denúncias abertas, mais recentes primeiro. `reportedUserId` filtra por denunciado. */
export async function listReports(reportedUserId?: string): Promise<ListReportsResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  if (reportedUserId !== undefined && !isUuid(reportedUserId)) {
    return { error: "Usuário inválido." };
  }

  const admin = createAdminClient();
  let query = admin
    .from("chat_reports")
    .select("id, reporter_id, reported_user_id, reason, details, snapshot, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);
  if (reportedUserId) query = query.eq("reported_user_id", reportedUserId);

  const { data: rows, error } = await query;
  if (error) return { error: "Não foi possível carregar as denúncias." };

  const userIds = [...new Set((rows ?? []).flatMap((r) => [r.reporter_id, r.reported_user_id]))];
  const { data: profiles } =
    userIds.length > 0
      ? await admin.from("profiles").select("id, full_name, chat_disabled").in("id", userIds)
      : { data: [] as { id: string; full_name: string; chat_disabled: boolean }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const reports: ChatReportItem[] = (rows ?? [])
    .filter((r) => isReportReason(r.reason))
    .map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      reason: r.reason as ReportReason,
      details: r.details,
      snapshot: Array.isArray(r.snapshot) ? (r.snapshot as unknown as ReportSnapshotEntry[]) : [],
      reportedUserId: r.reported_user_id,
      reportedName: profileById.get(r.reported_user_id)?.full_name ?? "Usuário",
      reportedChatDisabled: profileById.get(r.reported_user_id)?.chat_disabled ?? false,
      reporterName: profileById.get(r.reporter_id)?.full_name ?? "Usuário",
    }));

  return { reports };
}

/** Fecha uma denúncia aberta com um desfecho e uma nota opcional. */
export async function resolveReport(
  reportId: string,
  status: string,
  note?: string,
): Promise<{ error: string } | { success: true }> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  if (!isUuid(reportId)) return { error: "Denúncia não encontrada." };
  if (!isReportResolutionStatus(status)) return { error: "Desfecho inválido." };

  const trimmedNote = typeof note === "string" ? note.trim() : "";
  if ([...trimmedNote].length > 1000) return { error: "A nota pode ter no máximo 1000 caracteres." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("chat_reports")
    .update({
      status,
      admin_note: trimmedNote || null,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .eq("status", "open")
    .select("id");

  if (error) return { error: "Não foi possível atualizar a denúncia." };
  if (!data || data.length === 0) return { error: "Esta denúncia já foi analisada." };

  revalidatePath("/admin/denuncias");
  return { success: true as const };
}

/** Liga/desliga o chat de um usuário (não vale pra admin). */
export async function setChatDisabled(
  userId: string,
  disabled: boolean,
): Promise<{ error: string } | { success: true }> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  if (!isUuid(userId) || typeof disabled !== "boolean") return { error: "Usuário inválido." };
  if (userId === auth.user.id) return { error: "Você não pode desativar o próprio chat." };

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { error: "Usuário não encontrado." };
  if (target.role === "admin") return { error: "Não é possível desativar o chat de um admin." };

  const { error } = await admin.from("profiles").update({ chat_disabled: disabled }).eq("id", userId);
  if (error) return { error: "Não foi possível atualizar o usuário." };

  revalidatePath("/admin/denuncias");
  return { success: true as const };
}
