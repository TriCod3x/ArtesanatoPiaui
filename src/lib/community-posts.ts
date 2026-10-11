// Leitura de posts da Comunidade: select compartilhado e mapeamento da linha
// crua pro formato da UI. Usado pelo feed, pela aba Posts da loja e pela home.

import { resolvePostImages } from "@/lib/post-images";
import type { PostAuthor, PostMention, PostWithRelations } from "@/types";

export const POST_SELECT = `
  *,
  author:profiles(id, full_name, avatar_url),
  product:products(id, name, slug, price, images:product_images(url, is_cover, position)),
  likes:post_likes(user_id),
  comments:post_comments(id),
  images:community_post_images(url, position),
  reposts:community_reposts(user_id),
  mentions:community_post_mentions(mentioned_user_id, mentioned_store_id, store:stores(slug))
`;

export const REPOST_SELECT = `
  id, created_at,
  reposter:profiles(id, full_name, avatar_url),
  post:community_posts(${POST_SELECT})
`;

export interface RawPostRow {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  product_id: string | null;
  created_at: string;
  author: PostAuthor | null;
  product: PostWithRelations["product"];
  likes: { user_id: string }[] | null;
  comments: { id: string }[] | null;
  images: { url: string; position: number }[] | null;
  reposts: { user_id: string }[] | null;
  mentions:
    | {
        mentioned_user_id: string | null;
        mentioned_store_id: string | null;
        store: { slug: string } | null;
      }[]
    | null;
}

export interface RawRepostRow {
  id: string;
  created_at: string;
  reposter: PostAuthor | null;
  post: RawPostRow | null;
}

export function toPostWithRelations(post: RawPostRow, userId: string | null): PostWithRelations {
  const mentions: PostMention[] = [];
  for (const m of post.mentions ?? []) {
    if (m.mentioned_user_id) mentions.push({ kind: "user", id: m.mentioned_user_id });
    else if (m.mentioned_store_id) {
      mentions.push({ kind: "store", id: m.mentioned_store_id, storeSlug: m.store?.slug ?? null });
    }
  }

  return {
    id: post.id,
    author_id: post.author_id,
    content: post.content,
    image_url: post.image_url,
    product_id: post.product_id,
    created_at: post.created_at,
    author: post.author,
    product: post.product ?? null,
    likes_count: post.likes?.length ?? 0,
    comments_count: post.comments?.length ?? 0,
    liked_by_me: !!userId && !!post.likes?.some((like) => like.user_id === userId),
    images: resolvePostImages(post.images, post.image_url),
    reposts_count: post.reposts?.length ?? 0,
    reposted_by_me: !!userId && !!post.reposts?.some((r) => r.user_id === userId),
    mentions,
  };
}
