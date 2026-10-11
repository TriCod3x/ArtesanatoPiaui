"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, MessageCircle, Link2, Trash2, Loader2, Send, Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { toggleLike, toggleRepost, addComment, getComments, deletePost } from "@/actions/community";
import { cn, formatPrice } from "@/lib/utils";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { PostImages } from "@/components/community/PostImages";
import { PostText } from "@/components/community/PostText";
import type { PostWithRelations, CommentWithAuthor, PostAuthor } from "@/types";

interface PostCardProps {
  post: PostWithRelations;
  currentUserId?: string | null;
  /** Quando o card é uma republicação: quem republicou e quando. */
  repost?: { by: PostAuthor | null; at: string; id: string };
}

function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  return (
    <div
      className="rounded-full overflow-hidden bg-cream dark:bg-[#3d2c1a] flex items-center justify-center flex-shrink-0 relative"
      style={{ width: size, height: size }}
    >
      {url ? (
        <Image src={url} alt={name} fill className="object-cover" sizes={`${size}px`} />
      ) : (
        <span className="font-bold text-terracota" style={{ fontSize: size * 0.4 }}>
          {name?.[0]?.toUpperCase() ?? "A"}
        </span>
      )}
    </div>
  );
}

export function PostCard({ post, currentUserId, repost }: PostCardProps) {
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [bump, setBump] = useState(false);

  const [reposted, setReposted] = useState(!!post.reposted_by_me);
  const [repostsCount, setRepostsCount] = useState(post.reposts_count ?? 0);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentWithAuthor[] | null>(null);
  const [commentsCount, setCommentsCount] = useState(post.comments_count);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [deleted, setDeleted] = useState(false);
  const [, startTransition] = useTransition();

  if (deleted) return null;

  const authorName = post.author?.full_name ?? "Artesão";
  const isOwner = !!currentUserId && currentUserId === post.author_id;
  const productImage =
    post.product?.images?.find((i) => i.is_cover)?.url ?? post.product?.images?.[0]?.url;

  const handleLike = () => {
    const previousLiked = liked;
    const previousCount = likesCount;

    // Estado otimista: atualiza antes de confirmar no servidor
    setLiked(!previousLiked);
    setLikesCount(previousCount + (previousLiked ? -1 : 1));
    setBump(true);

    startTransition(async () => {
      const result = await toggleLike(post.id);
      if (result.error) {
        setLiked(previousLiked);
        setLikesCount(previousCount);
        toast.error(result.error);
        return;
      }
      setLiked(!!result.liked);
      setLikesCount(result.count ?? previousCount);
    });
  };

  const handleRepost = () => {
    if (!currentUserId) {
      toast.error("Entre na sua conta para republicar.");
      return;
    }

    const previousReposted = reposted;
    const previousCount = repostsCount;

    // Estado otimista, como na curtida.
    setReposted(!previousReposted);
    setRepostsCount(Math.max(0, previousCount + (previousReposted ? -1 : 1)));

    startTransition(async () => {
      const result = await toggleRepost(post.id);
      if ("error" in result) {
        setReposted(previousReposted);
        setRepostsCount(previousCount);
        toast.error(result.error);
        return;
      }
      setReposted(result.reposted);
      setRepostsCount(result.count);
      toast.success(result.reposted ? "Post republicado!" : "Republicação desfeita.");
    });
  };

  const handleToggleComments = async () => {
    const next = !commentsOpen;
    setCommentsOpen(next);

    if (next && comments === null) {
      setLoadingComments(true);
      const result = await getComments(post.id);
      setComments(result.comments);
      setCommentsCount(result.comments.length);
      setLoadingComments(false);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;

    setSending(true);
    const result = await addComment(post.id, content);
    setSending(false);

    if (result.error || !result.comment) {
      toast.error(result.error ?? "Erro ao comentar.");
      return;
    }

    setComments((prev) => [...(prev ?? []), result.comment as CommentWithAuthor]);
    setCommentsCount((c) => c + 1);
    setDraft("");
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/comunidade#post-${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const handleDelete = () => {
    if (!window.confirm("Excluir este post?")) return;

    startTransition(async () => {
      const result = await deletePost(post.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setDeleted(true);
      toast.success("Post excluído.");
    });
  };

  return (
    <article
      id={repost ? `repost-${repost.id}` : `post-${post.id}`}
      className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden"
      style={{ borderRadius: "16px" }}
    >
      {repost && (
        <div className="flex items-center gap-2 px-4 pt-3 text-xs font-semibold text-muted-foreground">
          <Repeat2 size={14} className="text-terracota flex-shrink-0" />
          <span className="truncate">
            {repost.by?.full_name ?? "Alguém"} republicou
          </span>
          <RelativeTime className="font-normal" date={repost.at} />
        </div>
      )}

      {/* Autor */}
      <header className="flex items-center gap-3 p-4 pb-3">
        <Avatar name={authorName} url={post.author?.avatar_url} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-dark dark:text-[#f5edd6] text-sm truncate">
            {authorName}
          </p>
          <RelativeTime className="text-xs text-muted-foreground" date={post.created_at} />
        </div>
        {isOwner && (
          <button
            onClick={handleDelete}
            title="Excluir post"
            className="text-muted-foreground hover:text-red-500 transition-colors p-1.5 rounded-lg cursor-pointer"
          >
            <Trash2 size={16} />
          </button>
        )}
      </header>

      {/* Texto */}
      <PostText
        content={post.content}
        mentions={post.mentions}
        className="px-4 pb-3 text-[15px] leading-relaxed text-dark dark:text-[#f5edd6] whitespace-pre-wrap break-words"
      />

      {/* Imagens */}
      <PostImages images={post.images ?? (post.image_url ? [post.image_url] : [])} />

      {/* Produto vinculado */}
      {post.product && (
        <div className="px-4 pb-3">
          <Link
            href={`/produtos/${post.product.slug}`}
            className="flex items-center gap-3 p-3 rounded-xl border border-border dark:border-[#3d2c1a] bg-cream/40 dark:bg-[#1f1509] hover:border-terracota/50 transition-colors group"
          >
            <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-cream dark:bg-[#3d2c1a] flex-shrink-0">
              {productImage ? (
                <Image src={productImage} alt={post.product.name} fill className="object-cover" sizes="56px" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl">🏺</div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                Produto
              </p>
              <p className="text-sm font-semibold text-dark dark:text-[#f5edd6] truncate group-hover:text-terracota transition-colors">
                {post.product.name}
              </p>
              <p className="text-sm font-bold text-terracota">{formatPrice(post.product.price)}</p>
            </div>
          </Link>
        </div>
      )}

      {/* Barra de ações */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-border dark:border-[#3d2c1a]">
        <button
          onClick={handleLike}
          aria-pressed={liked}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer active:scale-95",
            liked ? "text-terracota" : "text-muted-foreground hover:text-terracota hover:bg-terracota/5"
          )}
        >
          <Heart
            size={17}
            fill={liked ? "#C4622D" : "none"}
            className={cn("transition-colors duration-200", bump && "heart-pop")}
            onAnimationEnd={() => setBump(false)}
          />
          <span>{likesCount > 0 ? `${likesCount} ` : ""}Curtir</span>
        </button>

        <button
          onClick={handleToggleComments}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-terracota hover:bg-terracota/5 transition-colors cursor-pointer"
        >
          <MessageCircle size={17} />
          <span>{commentsCount > 0 ? `${commentsCount} ` : ""}Comentar</span>
        </button>

        {!isOwner && (
          <button
            onClick={handleRepost}
            aria-pressed={reposted}
            title={reposted ? "Desfazer republicação" : "Republicar"}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer active:scale-95",
              reposted
                ? "text-terracota bg-terracota/10"
                : "text-muted-foreground hover:text-terracota hover:bg-terracota/5"
            )}
          >
            <Repeat2 size={17} />
            <span>
              {repostsCount > 0 ? `${repostsCount} ` : ""}
              {reposted ? "Republicado" : "Republicar"}
            </span>
          </button>
        )}
        {isOwner && repostsCount > 0 && (
          <span className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <Repeat2 size={17} />
            {repostsCount}
          </span>
        )}

        <button
          onClick={handleShare}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-terracota hover:bg-terracota/5 transition-colors cursor-pointer ml-auto"
        >
          <Link2 size={17} />
          <span className="hidden sm:inline">Compartilhar</span>
        </button>
      </div>

      {/* Comentários */}
      {commentsOpen && (
        <div className="px-4 py-3 border-t border-border dark:border-[#3d2c1a] bg-cream/30 dark:bg-[#1f1509]">
          {loadingComments ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 size={14} className="animate-spin" /> Carregando comentários...
            </div>
          ) : comments && comments.length > 0 ? (
            <ul className="flex flex-col gap-3 mb-3">
              {comments.map((comment) => (
                <li key={comment.id} className="flex gap-2.5">
                  <Avatar
                    name={comment.author?.full_name ?? "A"}
                    url={comment.author?.avatar_url}
                    size={30}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="rounded-xl bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] px-3 py-2">
                      <p className="text-xs font-semibold text-dark dark:text-[#f5edd6]">
                        {comment.author?.full_name ?? "Artesão"}
                      </p>
                      <p className="text-sm text-dark dark:text-[#f5edd6] break-words whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                    <RelativeTime
                      className="text-[11px] text-muted-foreground pl-1"
                      date={comment.created_at}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">
              Nenhum comentário ainda. Seja o primeiro!
            </p>
          )}

          {currentUserId ? (
            <form onSubmit={handleComment} className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escreva um comentário..."
                maxLength={500}
                className="flex-1 rounded-full border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] text-dark dark:text-[#f5edd6] px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracota"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="w-9 h-9 rounded-full bg-terracota text-white flex items-center justify-center hover:bg-terracota/90 transition-colors disabled:opacity-50 cursor-pointer flex-shrink-0"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Link href="/login" className="text-terracota hover:underline font-medium">
                Entre
              </Link>{" "}
              para comentar.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
