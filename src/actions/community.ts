"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { postSchema, commentSchema } from "@/lib/validations";
import type { CommentWithAuthor } from "@/types";
import type { TablesInsert } from "@/types/database";

const AUTH_ERROR = "Você precisa estar logado.";

export async function createPost(
  content: string,
  imageUrl?: string,
  productId?: string
) {
  const parsed = postSchema.safeParse({ content, product_id: productId ?? "" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Post inválido." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR };

  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      author_id: user.id,
      content: parsed.data.content,
      image_url: imageUrl || null,
      product_id: productId || null,
    })
    .select("id")
    .single();

  if (error) return { error: "Erro ao publicar. Tente novamente." };

  revalidatePath("/comunidade");
  revalidatePath("/");

  return { success: true, postId: data.id };
}

export async function deletePost(postId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR };

  const { error } = await supabase
    .from("community_posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", user.id);

  if (error) return { error: "Erro ao excluir o post." };

  revalidatePath("/comunidade");
  revalidatePath("/");

  return { success: true };
}

export async function toggleLike(postId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR };

  const { data: existing } = await supabase
    .from("post_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("post_likes").delete().eq("id", existing.id);
    if (error) return { error: "Erro ao descurtir." };
  } else {
    const { error } = await supabase
      .from("post_likes")
      .insert({ post_id: postId, user_id: user.id });
    if (error) return { error: "Erro ao curtir." };
  }

  const { count } = await supabase
    .from("post_likes")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);

  revalidatePath("/comunidade");

  return { success: true, liked: !existing, count: count ?? 0 };
}

export async function addComment(postId: string, content: string) {
  const parsed = commentSchema.safeParse({ content });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Comentário inválido." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR };

  const { data, error } = await supabase
    .from("post_comments")
    .insert({ post_id: postId, author_id: user.id, content: parsed.data.content })
    .select("*, author:profiles(id, full_name, avatar_url)")
    .single();

  if (error) return { error: "Erro ao comentar. Tente novamente." };

  revalidatePath("/comunidade");

  return { success: true, comment: data as unknown as CommentWithAuthor };
}

export async function getComments(postId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("post_comments")
    .select("*, author:profiles(id, full_name, avatar_url)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) return { error: "Erro ao carregar comentários.", comments: [] };

  return { comments: (data ?? []) as unknown as CommentWithAuthor[] };
}

async function toggleFavorite(column: "product_id" | "store_id", targetId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR };

  const { data: existing } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq(column, targetId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("favorites").delete().eq("id", existing.id);
    if (error) return { error: "Erro ao remover dos favoritos." };
    return { success: true, liked: false };
  }

  const payload: TablesInsert<"favorites"> = {
    user_id: user.id,
    product_id: column === "product_id" ? targetId : null,
    store_id: column === "store_id" ? targetId : null,
  };

  const { error } = await supabase.from("favorites").insert(payload);

  if (error) return { error: "Erro ao favoritar." };

  return { success: true, liked: true };
}

export async function toggleProductLike(productId: string) {
  return toggleFavorite("product_id", productId);
}

export async function toggleStoreLike(storeId: string) {
  return toggleFavorite("store_id", storeId);
}

export async function uploadPostImage(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Nenhuma imagem selecionada." };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "O arquivo precisa ser uma imagem." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "A imagem deve ter no máximo 5MB." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR };

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("community-posts")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: "Erro ao fazer upload da imagem." };

  const { data } = supabase.storage.from("community-posts").getPublicUrl(path);

  return { url: data.publicUrl };
}
