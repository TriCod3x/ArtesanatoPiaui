"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { postSchema, commentSchema } from "@/lib/validations";
import {
  applyMentions,
  checkMentionShape,
  checkPostTextLength,
  isUuid,
  mentionKey,
  parseMentions,
  uniqueMentionTargets,
} from "@/lib/mentions";
import {
  MAX_UPLOAD_IMAGE_BYTES,
  POST_IMAGES_BUCKET,
  validatePostImageUrls,
} from "@/lib/post-images";
import {
  decideRepost,
  mentionNotificationLink,
  repostNotificationLink,
  resolveRepostTarget,
} from "@/lib/reposts";
import type { CommentWithAuthor } from "@/types";
import type { TablesInsert } from "@/types/database";
import type {
  MentionableResult,
  SearchMentionablesResult,
  ToggleRepostResult,
} from "@/types/actions";

const AUTH_ERROR = "Você precisa estar logado.";

/** Teto de resultados do autocomplete de marcações. */
const SEARCH_LIMIT = 8;

export async function createPost(
  content: string,
  imageUrls: string[] = [],
  productId?: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR };

  // Tudo abaixo é validado aqui: nada do que o navegador manda (texto, nomes
  // dentro dos tokens, URLs de imagem) é confiado.
  const parsedProduct = postSchema.shape.product_id.safeParse(productId ?? "");
  if (!parsedProduct.success) return { error: "Produto inválido" };

  const rawContent = typeof content === "string" ? content.trim() : "";
  const lengthError = checkPostTextLength(rawContent);
  if (lengthError) return { error: lengthError };

  const images = validatePostImageUrls(imageUrls, {
    userId: user.id,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  });
  if (!images.ok) return { error: images.error };

  // Menções: extrai os tokens, revalida cada id no banco e reescreve o nome.
  const parsedMentions = parseMentions(rawContent);
  const shapeError = checkMentionShape(parsedMentions);
  if (shapeError) return { error: shapeError };

  const targets = uniqueMentionTargets(parsedMentions.tokens);
  const userIds = targets.filter((t) => t.kind === "user").map((t) => t.id);
  const storeIds = targets.filter((t) => t.kind === "store").map((t) => t.id);

  const found = new Map<string, string>();
  const storeOwners = new Map<string, string>();
  if (userIds.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    if (error) return { error: "Erro ao validar as marcações. Tente novamente." };
    for (const p of data ?? []) found.set(mentionKey("user", p.id), p.full_name);
  }
  if (storeIds.length > 0) {
    const { data, error } = await supabase
      .from("stores")
      .select("id, name, owner_id")
      .in("id", storeIds)
      .eq("status", "active");
    if (error) return { error: "Erro ao validar as marcações. Tente novamente." };
    for (const st of data ?? []) {
      found.set(mentionKey("store", st.id), st.name);
      storeOwners.set(st.id, st.owner_id);
    }
  }

  const applied = applyMentions(rawContent, parsedMentions, found);
  if (!applied.ok) return { error: applied.error };

  // Reconfere o tamanho do texto já reescrito (nomes do banco podem ser maiores).
  const finalLengthError = checkPostTextLength(applied.content);
  if (finalLengthError) return { error: finalLengthError };

  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      author_id: user.id,
      content: applied.content,
      // Posts novos não gravam image_url: as imagens vão pra community_post_images.
      image_url: null,
      product_id: parsedProduct.data || null,
    })
    .select("id")
    .single();

  if (error) return { error: "Erro ao publicar. Tente novamente." };

  const postId = data.id;

  // Imagens e menções. Se qualquer gravação falhar, desfaz o post (cascade
  // leva as linhas filhas) pra não deixar post pela metade.
  const rollback = async () => {
    await supabase.from("community_posts").delete().eq("id", postId).eq("author_id", user.id);
  };

  if (images.urls.length > 0) {
    const { error: imagesError } = await supabase
      .from("community_post_images")
      .insert(images.urls.map((url, position) => ({ post_id: postId, url, position })));
    if (imagesError) {
      await rollback();
      return { error: "Erro ao salvar as imagens. Tente novamente." };
    }
  }

  if (applied.mentions.length > 0) {
    const { error: mentionsError } = await supabase.from("community_post_mentions").insert(
      applied.mentions.map((m) => ({
        post_id: postId,
        mentioned_user_id: m.kind === "user" ? m.id : null,
        mentioned_store_id: m.kind === "store" ? m.id : null,
      }))
    );
    if (mentionsError) {
      await rollback();
      return { error: "Erro ao salvar as marcações. Tente novamente." };
    }

    await notifyMentions({
      postId,
      authorId: user.id,
      mentions: applied.mentions,
      storeOwners,
    });
  }

  revalidatePath("/comunidade");
  revalidatePath("/");

  return { success: true, postId };
}

/**
 * Uma notificação por destinatário por post. Best-effort: falha aqui não
 * derruba a publicação. Usa o cliente admin porque o usuário comum não grava
 * notificação para outra pessoa (mesmo padrão de settle.ts).
 */
async function notifyMentions(params: {
  postId: string;
  authorId: string;
  mentions: { kind: "user" | "store"; id: string; name: string }[];
  storeOwners: Map<string, string>;
}) {
  try {
    const admin = createAdminClient();
    const { data: author } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", params.authorId)
      .maybeSingle();
    const authorName = author?.full_name ?? "Alguém";

    // destinatário -> mensagem (a primeira marcação do destinatário vence).
    const messages = new Map<string, string>();
    for (const m of params.mentions) {
      if (m.kind === "user") {
        if (m.id !== params.authorId && !messages.has(m.id)) {
          messages.set(m.id, `${authorName} marcou você em um post`);
        }
      } else {
        const owner = params.storeOwners.get(m.id);
        if (owner && owner !== params.authorId && !messages.has(owner)) {
          messages.set(owner, `Sua loja ${m.name} foi marcada em um post`);
        }
      }
    }
    if (messages.size === 0) return;

    await admin.from("notifications").insert(
      [...messages].map(([userId, message]) => ({
        user_id: userId,
        type: "comunidade_marcacao",
        title: "Você foi marcado em um post",
        message,
        link: mentionNotificationLink(params.postId),
      }))
    );
  } catch (err) {
    console.error("[comunidade] falha ao notificar marcações", { postId: params.postId }, err);
  }
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

export async function toggleRepost(postId: string): Promise<ToggleRepostResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR };
  if (typeof postId !== "string" || !isUuid(postId)) return { error: "Post não encontrado." };

  // O id pode ser de um post ou (por engano do cliente) de uma republicação:
  // nos dois casos o alvo é o post ORIGINAL.
  const { data: postRow } = await supabase
    .from("community_posts")
    .select("id, author_id")
    .eq("id", postId)
    .maybeSingle();

  let originalOfRepost: { id: string; author_id: string } | null = null;
  if (!postRow) {
    const { data: repostRow } = await supabase
      .from("community_reposts")
      .select("post:community_posts(id, author_id)")
      .eq("id", postId)
      .maybeSingle();
    const post = repostRow?.post as { id: string; author_id: string } | null | undefined;
    originalOfRepost = post ?? null;
  }

  const target = resolveRepostTarget({ postById: postRow, originalOfRepost });

  let alreadyReposted = false;
  if (target) {
    const { data: existing } = await supabase
      .from("community_reposts")
      .select("id")
      .eq("post_id", target.id)
      .eq("user_id", user.id)
      .maybeSingle();
    alreadyReposted = !!existing;
  }

  const decision = decideRepost({ userId: user.id, target, alreadyReposted });
  if (decision.kind === "error" || !target) {
    return { error: decision.kind === "error" ? decision.error : "Post não encontrado." };
  }

  if (decision.kind === "remove") {
    const { error } = await supabase
      .from("community_reposts")
      .delete()
      .eq("post_id", decision.postId)
      .eq("user_id", user.id);
    if (error) return { error: "Erro ao desfazer a republicação." };
  } else {
    const { error } = await supabase
      .from("community_reposts")
      .insert({ post_id: decision.postId, user_id: user.id });
    if (error) return { error: "Erro ao republicar." };

    await notifyRepost({
      postId: decision.postId,
      postAuthorId: target.author_id,
      reposterId: user.id,
    });
  }

  const { count } = await supabase
    .from("community_reposts")
    .select("id", { count: "exact", head: true })
    .eq("post_id", decision.postId);

  revalidatePath("/comunidade");

  return { success: true, reposted: decision.kind === "add", count: count ?? 0 };
}

/**
 * Avisa o autor, uma vez por par (quem republicou, post): republicar de novo
 * depois de desfazer não repete. O par é identificado pelo link (ver
 * repostNotificationLink). Best-effort.
 */
async function notifyRepost(params: {
  postId: string;
  postAuthorId: string;
  reposterId: string;
}) {
  try {
    const admin = createAdminClient();
    const link = repostNotificationLink(params.postId, params.reposterId);

    const { data: existing } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", params.postAuthorId)
      .eq("type", "comunidade_republicacao")
      .eq("link", link)
      .limit(1);
    if (existing && existing.length > 0) return;

    const { data: reposter } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", params.reposterId)
      .maybeSingle();

    await admin.from("notifications").insert({
      user_id: params.postAuthorId,
      type: "comunidade_republicacao",
      title: "Seu post foi republicado",
      message: `${reposter?.full_name ?? "Alguém"} republicou seu post`,
      link,
    });
  } catch (err) {
    console.error("[comunidade] falha ao notificar republicação", { postId: params.postId }, err);
  }
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

const UPLOAD_EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadPostImage(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Nenhuma imagem selecionada." };
  }
  // A extensão vem do tipo, não do nome do arquivo (que é do cliente).
  const ext = UPLOAD_EXT_BY_TYPE[file.type];
  if (!ext) {
    return { error: "O arquivo precisa ser uma imagem (JPG, PNG, WebP ou GIF)." };
  }
  if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
    return { error: "A imagem deve ter no máximo 5MB." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR };

  // Pasta do usuário (a policy de Storage exige o userId no primeiro segmento)
  // e nome único: vários arquivos do mesmo post sobem quase juntos.
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(POST_IMAGES_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (uploadError) return { error: "Erro ao fazer upload da imagem." };

  const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path);

  return { url: data.publicUrl };
}

/** Escapa curingas do ILIKE: o texto digitado vira busca literal. */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function searchMentionables(query: string): Promise<SearchMentionablesResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR };

  const q = typeof query === "string" ? query.trim().slice(0, 40) : "";
  if (q.length < 2) return { results: [] };
  const pattern = likePattern(q);

  // Só campos de exibição: nunca e-mail, telefone ou outro dado.
  const [storesRes, usersRes] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, logo_url")
      .eq("status", "active")
      .ilike("name", pattern)
      .order("name")
      .limit(SEARCH_LIMIT),
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .neq("id", user.id)
      .ilike("full_name", pattern)
      .order("full_name")
      .limit(SEARCH_LIMIT),
  ]);

  const stores: MentionableResult[] = (storesRes.data ?? []).map((s) => ({
    id: s.id,
    tipo: "store",
    nome: s.name,
    avatar: s.logo_url,
  }));
  const users: MentionableResult[] = (usersRes.data ?? []).map((p) => ({
    id: p.id,
    tipo: "user",
    nome: p.full_name,
    avatar: p.avatar_url,
  }));

  // Mistura lojas e usuários (alternando) até o teto.
  const results: MentionableResult[] = [];
  for (let i = 0; results.length < SEARCH_LIMIT && (i < stores.length || i < users.length); i++) {
    if (i < stores.length) results.push(stores[i]);
    if (results.length < SEARCH_LIMIT && i < users.length) results.push(users[i]);
  }

  return { results };
}
