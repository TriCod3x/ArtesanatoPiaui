import Image from "next/image";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import type { PostWithRelations } from "@/types";

interface CommunityFeedProps {
  posts: PostWithRelations[];
}

export function CommunityFeed({ posts }: CommunityFeedProps) {
  if (!posts.length) return null;

  return (
    <section className="py-14 max-w-7xl mx-auto px-4">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">
            Comunidade de artesãos
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">Novidades direto das lojas do Piauí</p>
        </div>
        <Link
          href="/comunidade"
          className="text-sm font-semibold text-terracota hover:underline whitespace-nowrap"
        >
          Ver tudo
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/comunidade#post-${post.id}`}
            className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-2xl overflow-hidden hover:shadow-md hover:border-terracota/30 transition-all block"
          >
            {post.image_url && (
              <div className="relative w-full" style={{ height: "200px" }}>
                <Image
                  src={post.image_url}
                  alt="Post da comunidade"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
            )}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-cream dark:bg-[#3d2c1a] flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                  {post.author?.avatar_url ? (
                    <Image
                      src={post.author.avatar_url}
                      alt={post.author.full_name ?? ""}
                      fill
                      className="object-cover"
                      sizes="32px"
                    />
                  ) : (
                    <span className="text-xs font-bold text-terracota">
                      {post.author?.full_name?.[0]?.toUpperCase() ?? "A"}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-dark dark:text-[#f5edd6] truncate block">
                    {post.author?.full_name ?? "Artesão"}
                  </span>
                  <span className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</span>
                </div>
              </div>
              <p className="text-sm text-dark dark:text-[#c4a882] leading-relaxed line-clamp-3">
                {post.content}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
