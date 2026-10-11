import Link from "next/link";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PostCard } from "@/components/community/PostCard";
import { CreatePostForm } from "@/components/community/CreatePostForm";
import { mergeFeed } from "@/lib/reposts";
import {
  POST_SELECT,
  REPOST_SELECT,
  toPostWithRelations,
  type RawPostRow,
  type RawRepostRow,
} from "@/lib/community-posts";
import type { FeedItem, PostAuthor } from "@/types";

// Página sempre renderizada por requisição: depende do usuário logado
// (formulário de novo post, "curti", produtos da loja). Nunca deve ser servida
// de cache entre usuários.
export const dynamic = "force-dynamic";

// Quantos itens (posts + republicações juntos) o feed mostra.
const FEED_LIMIT = 50;

export default async function ComunidadePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Cada fonte já vem limitada a FEED_LIMIT: o top-N da união (por data do
  // post ou da republicação) nunca precisa de mais que isso de cada lado.
  const [postsRes, repostsRes, profileRes] = await Promise.all([
    supabase
      .from("community_posts")
      .select(POST_SELECT)
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
    supabase
      .from("community_reposts")
      .select(REPOST_SELECT)
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
    user
      ? supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const userId = user?.id ?? null;

  const postItems: FeedItem[] = ((postsRes.data ?? []) as unknown as RawPostRow[]).map((post) => ({
    kind: "post",
    key: `post-${post.id}`,
    sortAt: post.created_at,
    post: toPostWithRelations(post, userId),
  }));

  // Republicação aparece na data da republicação, com o post original dentro.
  const repostItems: FeedItem[] = ((repostsRes.data ?? []) as unknown as RawRepostRow[]).flatMap(
    (repost) =>
      repost.post
        ? [
            {
              kind: "repost" as const,
              key: `repost-${repost.id}`,
              sortAt: repost.created_at,
              post: toPostWithRelations(repost.post, userId),
              repostedBy: repost.reposter,
            },
          ]
        : []
  );

  const feed = mergeFeed([...postItems, ...repostItems], FEED_LIMIT);

  const profile = (profileRes.data ?? null) as PostAuthor | null;

  // Produtos do vendedor, para a opção "Vincular a um produto"
  let sellerProducts: { id: string; name: string }[] = [];
  if (user) {
    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (store) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });
      sellerProducts = products ?? [];
    }
  }

  return (
    <>
      <Header />
      <main className="flex-1 bg-background">
        <div className="max-w-2xl mx-auto px-4 py-10">
          <header className="mb-8">
            <h1 className="font-display text-4xl font-bold text-dark dark:text-[#f5edd6]">
              Comunidade
            </h1>
            <p className="text-muted-foreground mt-1">
              Bastidores, novidades e conversas entre artesãos do Piauí.
            </p>
          </header>

          {user && profile ? (
            <CreatePostForm
              key={profile.id}
              author={profile}
              products={sellerProducts}
            />
          ) : (
            <div
              className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm p-5 mb-8 text-center"
              style={{ borderRadius: "16px" }}
            >
              <p className="text-dark dark:text-[#f5edd6] font-medium">
                Faça parte da conversa
              </p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Entre na sua conta para publicar, curtir e comentar.
              </p>
              <Link
                href="/login"
                className="inline-block bg-terracota hover:bg-terracota/90 text-white font-semibold text-sm px-6 py-2 rounded-full transition-colors"
              >
                Entrar
              </Link>
            </div>
          )}

          {feed.length === 0 ? (
            <div
              className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm py-16 px-6 text-center"
              style={{ borderRadius: "16px" }}
            >
              <div className="w-20 h-20 rounded-full bg-terracota/10 flex items-center justify-center mx-auto mb-5">
                <Users size={36} className="text-terracota" />
              </div>
              <p className="font-display text-xl font-bold text-dark dark:text-[#f5edd6]">
                Seja o primeiro a compartilhar algo na comunidade
              </p>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Mostre uma peça nova, conte um bastidor do seu ateliê ou celebre uma venda.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {feed.map((item) =>
                item.kind === "repost" ? (
                  <PostCard
                    key={item.key}
                    post={item.post}
                    currentUserId={userId}
                    repost={{
                      by: item.repostedBy,
                      at: item.sortAt,
                      id: item.key.slice("repost-".length),
                    }}
                  />
                ) : (
                  <PostCard key={item.key} post={item.post} currentUserId={userId} />
                )
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
