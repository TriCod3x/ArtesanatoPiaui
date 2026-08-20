import Link from "next/link";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PostCard } from "@/components/community/PostCard";
import { CreatePostForm } from "@/components/community/CreatePostForm";
import type { PostWithRelations, PostAuthor } from "@/types";

interface RawPost {
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
}

export default async function ComunidadePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [postsRes, profileRes] = await Promise.all([
    supabase
      .from("community_posts")
      .select(
        `
        *,
        author:profiles(id, full_name, avatar_url),
        product:products(id, name, slug, price, images:product_images(url, is_cover, position)),
        likes:post_likes(user_id),
        comments:post_comments(id)
      `
      )
      .order("created_at", { ascending: false })
      .limit(50),
    user
      ? supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const posts: PostWithRelations[] = ((postsRes.data ?? []) as unknown as RawPost[]).map(
    (post) => ({
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
      liked_by_me: !!user && !!post.likes?.some((like) => like.user_id === user.id),
    })
  );

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
            <CreatePostForm author={profile} products={sellerProducts} />
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

          {posts.length === 0 ? (
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
              {posts.map((post) => (
                <PostCard key={post.id} post={post} currentUserId={user?.id ?? null} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
