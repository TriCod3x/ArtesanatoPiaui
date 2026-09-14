import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/product/ProductCard";
import { PostCard } from "@/components/community/PostCard";
import { SendMessageButton } from "@/components/messages/SendMessageButton";
import { Avatar } from "@/components/shared/Avatar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { Badge } from "@/components/ui/badge";
import { formatWhatsApp, cn } from "@/lib/utils";
import { Calendar, MapPin, Star } from "lucide-react";
import { LikeButton } from "@/components/community/LikeButton";
import type {
  StoreWithContacts,
  ProductWithRelations,
  PostWithRelations,
  PostAuthor,
} from "@/types";

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.867-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
  </svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const TABS = [
  { key: "produtos", label: "Produtos" },
  { key: "avaliacoes", label: "Avaliações" },
  { key: "sobre", label: "Sobre" },
  { key: "posts", label: "Posts" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  buyer: { full_name: string; avatar_url: string | null } | { full_name: string; avatar_url: string | null }[] | null;
  product: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

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

function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= Math.round(rating) ? "text-amber fill-amber" : "text-border dark:text-[#3d2c1a]"}
        />
      ))}
    </div>
  );
}

export default async function LojaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const activeTab: TabKey = (TABS.some((t) => t.key === tab) ? tab : "produtos") as TabKey;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: storeData } = await supabase
    .from("stores")
    .select("*, contacts:store_contacts(id, type, value, is_primary)")
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (!storeData) notFound();

  const store = storeData as unknown as StoreWithContacts;
  const whatsapp = store.contacts?.find((c) => c.type === "whatsapp")?.value;
  const instagram = store.contacts?.find((c) => c.type === "instagram")?.value;
  const isOwnStore = !!user && user.id === store.owner_id;

  const { data: owner } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", store.owner_id)
    .maybeSingle();

  // Dados carregados sob demanda, só pra aba ativa.
  let products: ProductWithRelations[] = [];
  let reviews: ReviewRow[] = [];
  let categories: CategoryRef[] = [];
  let posts: PostWithRelations[] = [];

  if (activeTab === "produtos") {
    const { data } = await supabase
      .from("products")
      .select(`*, category:categories(id, name, slug), images:product_images(id, url, position, is_cover)`)
      .eq("store_id", store.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    products = (data ?? []).map((p) => ({ ...p, store })) as unknown as ProductWithRelations[];
  }

  if (activeTab === "avaliacoes") {
    const { data } = await supabase
      .from("reviews")
      .select(
        `
        id, rating, comment, created_at,
        buyer:profiles!reviews_buyer_id_fkey(full_name, avatar_url),
        product:products(name, slug)
        `,
      )
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });
    reviews = (data ?? []) as unknown as ReviewRow[];
  }

  if (activeTab === "sobre") {
    const { data } = await supabase
      .from("products")
      .select("category:categories(id, name, slug)")
      .eq("store_id", store.id)
      .eq("status", "active")
      .not("category_id", "is", null);

    const seen = new Map<string, CategoryRef>();
    for (const row of data ?? []) {
      const cat = (Array.isArray(row.category) ? row.category[0] : row.category) as CategoryRef | null;
      if (cat) seen.set(cat.id, cat);
    }
    categories = [...seen.values()];
  }

  if (activeTab === "posts") {
    const { data } = await supabase
      .from("community_posts")
      .select(
        `
        *,
        author:profiles(id, full_name, avatar_url),
        product:products(id, name, slug, price, images:product_images(url, is_cover, position)),
        likes:post_likes(user_id),
        comments:post_comments(id)
        `,
      )
      .eq("author_id", store.owner_id)
      .order("created_at", { ascending: false });

    posts = ((data ?? []) as unknown as RawPost[]).map((post) => ({
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
    }));
  }

  const reviewsAverage = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;
  const reviewsDistribution = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => r.rating === star).length;
    return { star, count, pct: reviews.length ? Math.round((count / reviews.length) * 100) : 0 };
  });

  return (
    <>
      <Header />
      <main className="flex-1">
        {/* Banner */}
        <div
          className="relative h-48 md:h-64 overflow-hidden"
          style={store.banner_url ? undefined : { background: "linear-gradient(135deg, #1A1208 0%, #C4622D 55%, #D4920A 100%)" }}
        >
          {store.banner_url && (
            <Image src={store.banner_url} alt="" fill className="object-cover" sizes="100vw" />
          )}
          <div className="absolute inset-0 bg-dark/25" />
        </div>

        <div className="max-w-7xl mx-auto px-4">
          {/* Store header */}
          <div className="flex flex-col md:flex-row md:items-end gap-4 -mt-12 mb-8 relative z-10">
            <div className="w-24 h-24 rounded-2xl border-4 border-white dark:border-[#1a1208] shadow-lg overflow-hidden bg-cream dark:bg-[#2a1e0f] flex-shrink-0">
              {store.logo_url ? (
                <Image src={store.logo_url} alt={store.name} fill className="object-cover" sizes="96px" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-terracota text-3xl bg-terracota/10">
                  {store.name[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1">
              <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">{store.name}</h1>
              {owner?.full_name && (
                <div className="flex items-center gap-2 mt-1.5 text-sm text-muted-foreground">
                  <Avatar name={owner.full_name} url={owner.avatar_url} size={24} />
                  <span>por {owner.full_name}</span>
                </div>
              )}
              <div className="flex items-center flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin size={14} />{store.city}, {store.state}</span>
                {store.rating && store.rating > 0 && (
                  <span className="flex items-center gap-1 text-amber font-semibold">
                    <Star size={14} fill="currentColor" />{store.rating.toFixed(1)}
                  </span>
                )}
                <span>{store.total_sales} vendas</span>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <LikeButton targetId={store.id} target="store" variant="pill" label="Favoritar" />
              {!isOwnStore && <SendMessageButton storeId={store.id} />}
              {whatsapp && (
                <a href={formatWhatsApp(whatsapp)} target="_blank" rel="noopener noreferrer">
                  <button
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ background: "#25D366" }}
                  >
                    <WhatsAppIcon /> WhatsApp
                  </button>
                </a>
              )}
              {instagram && (
                <a href={`https://instagram.com/${instagram}`} target="_blank" rel="noopener noreferrer">
                  <button
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)" }}
                  >
                    <InstagramIcon /> Instagram
                  </button>
                </a>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border dark:border-[#3d2c1a] mb-8 overflow-x-auto">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/lojas/${slug}?tab=${t.key}`}
                className={cn(
                  "px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors",
                  activeTab === t.key
                    ? "border-terracota text-terracota"
                    : "border-transparent text-muted-foreground hover:text-dark dark:hover:text-[#f5edd6]",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {/* Produtos */}
          {activeTab === "produtos" && (
            <div className="pb-12">
              <p className="text-sm text-muted-foreground mb-6">
                {products.length} produto{products.length !== 1 ? "s" : ""}
              </p>
              {products.length === 0 ? (
                <p className="text-muted-foreground py-16 text-center">Esta loja ainda não tem produtos.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {products.map((product) => <ProductCard key={product.id} product={product} />)}
                </div>
              )}
            </div>
          )}

          {/* Avaliações */}
          {activeTab === "avaliacoes" && (
            <div className="pb-12">
              {reviews.length === 0 ? (
                <p className="text-muted-foreground py-16 text-center">
                  Esta loja ainda não recebeu avaliações.
                </p>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row gap-8 mb-8 p-6 bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-2xl">
                    <div className="flex flex-col items-center justify-center sm:pr-8 sm:border-r border-border dark:border-[#3d2c1a] flex-shrink-0">
                      <p className="text-5xl font-black text-terracota">{reviewsAverage.toFixed(1)}</p>
                      <div className="my-1.5"><StarRow rating={reviewsAverage} size={16} /></div>
                      <p className="text-sm text-muted-foreground whitespace-nowrap">
                        {reviews.length} avaliaç{reviews.length === 1 ? "ão" : "ões"}
                      </p>
                    </div>
                    <div className="flex-1 flex flex-col gap-2 justify-center">
                      {reviewsDistribution.map((d) => (
                        <div key={d.star} className="flex items-center gap-2 text-sm">
                          <span className="w-8 text-muted-foreground flex-shrink-0">{d.star}★</span>
                          <div className="flex-1 h-2 rounded-full bg-cream dark:bg-[#3d2c1a] overflow-hidden">
                            <div className="h-full bg-amber" style={{ width: `${d.pct}%` }} />
                          </div>
                          <span className="w-10 text-right text-muted-foreground flex-shrink-0">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    {reviews.map((r) => {
                      const buyer = Array.isArray(r.buyer) ? r.buyer[0] : r.buyer;
                      const product = Array.isArray(r.product) ? r.product[0] : r.product;
                      return (
                        <div key={r.id} className="p-5 bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-xl">
                          <div className="flex items-center gap-3 mb-2">
                            <Avatar name={buyer?.full_name ?? "Comprador"} url={buyer?.avatar_url} size={36} />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm text-dark dark:text-[#f5edd6] truncate">
                                {buyer?.full_name ?? "Comprador"}
                              </p>
                              <div className="flex items-center gap-2">
                                <StarRow rating={r.rating} size={12} />
                                <RelativeTime date={r.created_at} className="text-xs text-muted-foreground" />
                              </div>
                            </div>
                          </div>
                          {r.comment && (
                            <p className="text-sm text-dark dark:text-[#f5edd6] leading-relaxed mb-2">{r.comment}</p>
                          )}
                          {product && (
                            <Link href={`/produtos/${product.slug}`} className="text-xs text-terracota hover:underline">
                              Sobre: {product.name}
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Sobre */}
          {activeTab === "sobre" && (
            <div className="max-w-2xl space-y-8 pb-12">
              {store.description && (
                <div>
                  <h2 className="font-semibold text-dark dark:text-[#f5edd6] mb-2">Descrição</h2>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{store.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-xl">
                  <p className="text-2xl font-bold text-dark dark:text-[#f5edd6]">{store.total_sales}</p>
                  <p className="text-xs text-muted-foreground mt-1">Vendas realizadas</p>
                </div>
                <div className="p-4 bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-xl">
                  <p className="text-2xl font-bold text-dark dark:text-[#f5edd6]">
                    {store.rating && store.rating > 0 ? store.rating.toFixed(1) : "–"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Avaliação média</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-2"><MapPin size={15} /> {store.city}, {store.state}</span>
                <span className="flex items-center gap-2">
                  <Calendar size={15} /> Na Artesanatos Piauí desde {monthYear(store.created_at)}
                </span>
              </div>

              {categories.length > 0 && (
                <div>
                  <h2 className="font-semibold text-dark dark:text-[#f5edd6] mb-3">Categorias</h2>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <Badge key={c.id} variant="outline" className="border-terracota/30 text-terracota">
                        {c.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Posts */}
          {activeTab === "posts" && (
            <div className="pb-12">
              {posts.length === 0 ? (
                <p className="text-muted-foreground py-16 text-center">
                  Esta loja ainda não publicou na comunidade.
                </p>
              ) : (
                <div className="flex flex-col gap-5 max-w-2xl">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} currentUserId={user?.id ?? null} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
