"use server";

import { createClient } from "@/lib/supabase/server";
import type { StoreInput } from "@/lib/validations";
import { COMMISSION_RATE } from "@/lib/constants";
import { stripPhone } from "@/lib/utils";

export async function createStore(data: StoreInput) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { data: store, error } = await supabase
    .from("stores")
    .insert({
      owner_id: user.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      city: data.city,
      state: data.state ?? "PI",
      logo_url: data.logo_url ?? null,
      banner_url: data.banner_url ?? null,
      status: "pending",
      commission_rate: COMMISSION_RATE * 100,
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

  return { success: true };
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
