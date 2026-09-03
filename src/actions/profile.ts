"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { profileSchema, type ProfileInput } from "@/lib/validations";

const AUTH_ERROR = "Você precisa estar logado.";

/**
 * Atualiza o perfil do usuário autenticado (comprador ou vendedor).
 * Campos editáveis: nome completo, cidade e foto de perfil (avatar_url).
 * O upload do avatar acontece no cliente (bucket `avatars`); aqui só gravamos a URL.
 */
export async function updateProfile(data: ProfileInput) {
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR };

  const { full_name, city, avatar_url } = parsed.data;

  // Avatar anterior — para remover do Storage se foi trocado.
  const { data: current } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name,
      city: city ? city : null,
      avatar_url: avatar_url ? avatar_url : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: "Erro ao salvar o perfil. Tente novamente." };

  // Remove o avatar antigo do bucket quando trocado (a policy de DELETE exige
  // que o primeiro segmento do path seja o userId, o que é o caso).
  const oldUrl = current?.avatar_url;
  if (oldUrl && oldUrl !== avatar_url && oldUrl.includes("/avatars/")) {
    const oldPath = oldUrl.split("/avatars/")[1]?.split("?")[0];
    if (oldPath) {
      await supabase.storage.from("avatars").remove([oldPath]);
    }
  }

  // Mantém o user_metadata em sincronia — o Header lê o nome de lá em alguns fluxos.
  await supabase.auth.updateUser({
    data: { full_name, avatar_url: avatar_url || null },
  });

  revalidatePath("/perfil");
  revalidatePath("/comunidade");
  revalidatePath("/");

  return { success: true };
}
