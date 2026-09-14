"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  submitSellerRequirementsSchema,
  ACCEPTED_ID_DOCUMENT_TYPES,
  MAX_ID_DOCUMENT_BYTES,
  type StoreInput,
} from "@/lib/validations";
import { COMMISSION_RATE, IDENTITY_DOCUMENTS_BUCKET } from "@/lib/constants";
import { onlyDigits, stripPhone } from "@/lib/utils";

const DOCUMENT_EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

export async function createStore(data: StoreInput) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  // Reaproveita o endereço informado no cadastro de vendedor (KYC), se houver.
  const { data: verification } = await supabase
    .from("seller_verifications")
    .select(
      "cep, address_street, address_number, address_complement, address_neighborhood, address_city",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: store, error } = await supabase
    .from("stores")
    .insert({
      owner_id: user.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      city: verification?.address_city || data.city,
      state: data.state ?? "PI",
      logo_url: data.logo_url ?? null,
      banner_url: data.banner_url ?? null,
      status: "pending",
      commission_rate: COMMISSION_RATE * 100,
      cep: verification?.cep ?? null,
      address_street: verification?.address_street ?? null,
      address_number: verification?.address_number ?? null,
      address_complement: verification?.address_complement ?? null,
      address_neighborhood: verification?.address_neighborhood ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Esse slug já está em uso. Tente outro nome." };
    return { error: "Erro ao criar loja. Tente novamente." };
  }

  // Criar contatos
  const contacts = [];

  if (data.whatsapp) {
    contacts.push({ store_id: store.id, type: "whatsapp" as const, value: stripPhone(data.whatsapp), is_primary: true });
  }
  if (data.instagram) {
    contacts.push({ store_id: store.id, type: "instagram" as const, value: data.instagram.replace(/^@/, ""), is_primary: false });
  }

  if (contacts.length > 0) {
    await supabase.from("store_contacts").insert(contacts);
  }

  return { success: true };
}

export async function updateStore(storeId: string, data: Partial<StoreInput>) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { data: existing } = await supabase
    .from("stores")
    .select("status")
    .eq("id", storeId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!existing) return { error: "Loja não encontrada." };

  const { whatsapp, instagram, ...storeData } = data;

  const { error } = await supabase
    .from("stores")
    .update({ ...storeData, updated_at: new Date().toISOString() })
    .eq("id", storeId)
    .eq("owner_id", user.id);

  if (error) return { error: "Erro ao atualizar loja." };

  // Atualizar contatos se fornecidos
  if (whatsapp !== undefined) {
    await supabase
      .from("store_contacts")
      .upsert({ store_id: storeId, type: "whatsapp", value: stripPhone(whatsapp), is_primary: true });
  }
  if (instagram !== undefined) {
    await supabase
      .from("store_contacts")
      .upsert({ store_id: storeId, type: "instagram", value: instagram.replace(/^@/, ""), is_primary: false });
  }

  // Reenvio: editar uma loja suspensa a devolve para a fila de análise do
  // admin. Um trigger no banco bloqueia o dono de mudar `status` diretamente
  // (evita auto-aprovação), então essa transição específica (suspended ->
  // pending) roda via service role, como as demais ações administrativas.
  let resubmitted = false;
  if (existing.status === "suspended") {
    const admin = createAdminClient();
    const { error: resubmitError } = await admin
      .from("stores")
      .update({ status: "pending", rejection_reason: null })
      .eq("id", storeId);
    if (!resubmitError) {
      resubmitted = true;
      revalidatePath("/dashboard");
      revalidatePath("/admin/lojas");
    }
  }

  return { success: true, resubmitted };
}

export async function uploadStoreLogo(storeId: string, file: File) {
  const supabase = await createClient();

  const ext = file.name.split(".").pop();
  const path = `stores/${storeId}/logo.${ext}`;

  const { error } = await supabase.storage.from("store-images").upload(path, file, { upsert: true });
  if (error) return { error: "Erro ao fazer upload do logo." };

  const { data } = supabase.storage.from("store-images").getPublicUrl(path);

  await supabase.from("stores").update({ logo_url: data.publicUrl }).eq("id", storeId);

  return { url: data.publicUrl };
}

export async function uploadStoreBanner(storeId: string, file: File) {
  const supabase = await createClient();

  const ext = file.name.split(".").pop();
  const path = `stores/${storeId}/banner.${ext}`;

  const { error } = await supabase.storage.from("store-images").upload(path, file, { upsert: true });
  if (error) return { error: "Erro ao fazer upload do banner." };

  const { data } = supabase.storage.from("store-images").getPublicUrl(path);

  await supabase.from("stores").update({ banner_url: data.publicUrl }).eq("id", storeId);

  return { url: data.publicUrl };
}

// ── Cadastro de vendedor (KYC-lite) ─────────────────────────────────────────

export interface SubmitSellerRequirementsData {
  cpf: string;
  cnpj?: string;
  cep: string;
  address_street: string;
  address_number: string;
  address_complement?: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  accept_terms: boolean;
  document: File;
}

/**
 * Recebe os dados do KYC-lite do vendedor:
 * - valida CPF/CNPJ pelos dígitos verificadores (via Zod + utils)
 * - faz upload do documento de identidade no bucket PRIVADO `identity-documents`
 *   no path `{userId}/{timestamp}.ext`
 * - grava `terms_accepted_at = now()` somente quando o checkbox foi marcado
 * - define `document_status = 'pending'`
 */
export async function submitSellerRequirements(
  data: SubmitSellerRequirementsData,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const parsed = submitSellerRequirementsSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const values = parsed.data;

  if (!data.accept_terms) {
    return { error: "Você precisa aceitar os termos de uso." };
  }

  const file = data.document;
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Envie o documento de identidade." };
  }
  if (!(ACCEPTED_ID_DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
    return { error: "Documento deve ser JPG, PNG ou PDF." };
  }
  if (file.size > MAX_ID_DOCUMENT_BYTES) {
    return { error: "O documento deve ter no máximo 5MB." };
  }

  const { data: existing } = await supabase
    .from("seller_verifications")
    .select("id_document_path")
    .eq("user_id", user.id)
    .maybeSingle();

  const ext =
    DOCUMENT_EXT_BY_TYPE[file.type] ??
    file.name.split(".").pop()?.toLowerCase() ??
    "bin";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(IDENTITY_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { error: "Erro ao enviar o documento. Tente novamente." };
  }

  const { error } = await supabase.from("seller_verifications").upsert(
    {
      user_id: user.id,
      cpf: onlyDigits(values.cpf),
      cnpj: values.cnpj ? onlyDigits(values.cnpj) : null,
      cep: onlyDigits(values.cep),
      address_street: values.address_street,
      address_number: values.address_number,
      address_complement: values.address_complement || null,
      address_neighborhood: values.address_neighborhood,
      address_city: values.address_city,
      address_state: values.address_state,
      id_document_path: path,
      // o trigger no banco também força esses valores para não-admin,
      // mas deixamos explícito aqui.
      document_status: "pending",
      rejection_reason: null,
      terms_accepted_at: data.accept_terms ? new Date().toISOString() : null,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    // rollback do arquivo recém-enviado
    await supabase.storage.from(IDENTITY_DOCUMENTS_BUCKET).remove([path]);
    return { error: "Erro ao salvar seus dados. Tente novamente." };
  }

  // limpa o documento anterior (reenvio)
  if (existing?.id_document_path && existing.id_document_path !== path) {
    await supabase.storage
      .from(IDENTITY_DOCUMENTS_BUCKET)
      .remove([existing.id_document_path]);
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/** Signed URL do próprio documento do vendedor (bucket privado). */
export async function getMySellerDocumentUrl() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { data: verification } = await supabase
    .from("seller_verifications")
    .select("id_document_path")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!verification?.id_document_path) {
    return { error: "Nenhum documento enviado." };
  }

  const { data, error } = await supabase.storage
    .from(IDENTITY_DOCUMENTS_BUCKET)
    .createSignedUrl(verification.id_document_path, 60 * 5);

  if (error || !data?.signedUrl) {
    return { error: "Não foi possível gerar o link do documento." };
  }

  return { url: data.signedUrl };
}

