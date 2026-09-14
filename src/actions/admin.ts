"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IDENTITY_DOCUMENTS_BUCKET, SIGNED_URL_TTL } from "@/lib/constants";
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
