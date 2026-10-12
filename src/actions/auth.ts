"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { SignInInput, SignUpInput } from "@/lib/validations";

export async function signIn(data: SignInInput) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  if (error) {
    return { error: "Email ou senha incorretos." };
  }

  redirect("/");
}

export async function signUp(
  data: SignUpInput,
  options?: { redirect?: boolean },
) {
  const shouldRedirect = options?.redirect ?? true;
  const supabase = await createClient();

  const { data: authData, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.full_name,
        role: data.role,
        phone: data.phone ?? null,
      },
    },
  });

  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "Este email já está cadastrado." };
    }
    return { error: "Erro ao criar conta. Tente novamente." };
  }

  if (authData.user) {
    // O perfil já é criado pelo trigger handle_new_user (com full_name e role).
    // O usuário só pode atualizar full_name, avatar_url, phone, city e state:
    // um upsert com id/role cairia em "permission denied" (ON CONFLICT DO UPDATE).
    await supabase
      .from("profiles")
      .update({ full_name: data.full_name, phone: data.phone ?? null })
      .eq("id", authData.user.id);
  }

  if (!shouldRedirect) {
    return { success: true };
  }

  if (data.role === "seller") {
    redirect("/minha-loja/nova");
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
