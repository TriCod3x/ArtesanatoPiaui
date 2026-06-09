import Image from "next/image";
import Link from "next/link";
import type { CommunityPost } from "@/types";

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

interface CommunityFeedProps {
  posts: CommunityPost[];
}

export function CommunityFeed({ posts }: CommunityFeedProps) {
  if (!posts.length) return null;

  return (
    <section className="py-14 max-w-7xl mx-auto px-4">
      <div className="mb-8">
        <h2 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">Comunidade de artesãos</h2>
        <p className="text-muted-foreground mt-1 text-sm">Novidades direto das lojas do Piauí</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {posts.map((post) => (
          <article
            key={post.id}
            className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-2xl overflow-hidden hover:shadow-md hover:border-terracota/30 transition-all"
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
                <div className="w-8 h-8 rounded-full bg-cream dark:bg-[#3d2c1a] flex items-center justify-center overflow-hidden flex-shrink-0">
                  {post.store?.logo_url ? (
                    <Image
                      src={post.store.logo_url}
                      alt={post.store.name ?? ""}
                      width={32}
                      height={32}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <span className="text-xs font-bold text-terracota">
                      {post.store?.name?.[0]?.toUpperCase() ?? "A"}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <Link
                    href={`/lojas/${post.store?.slug ?? ""}`}
                    className="text-sm font-semibold text-dark dark:text-[#f5edd6] hover:text-terracota transition-colors truncate block"
                  >
                    {post.store?.name ?? "Artesão"}
                  </Link>
                  <span className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</span>
                </div>
              </div>
              <p className="text-sm text-dark dark:text-[#c4a882] leading-relaxed line-clamp-3">{post.content}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
