import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HeroSection, type HeroStats } from "@/components/home/HeroSection";
import { CategoriesGrid } from "@/components/home/CategoriesGrid";
import { FeaturedProducts } from "@/components/home/FeaturedProducts";
import { FeaturedStores } from "@/components/home/FeaturedStores";
import { CommunityFeed } from "@/components/home/CommunityFeed";
import { MIN_ACTIVE_PRODUCTS_FOR_HOME_STATS } from "@/lib/constants";
import type { ProductWithRelations, StoreWithContacts, PostWithRelations } from "@/types";

export default async function HomePage() {
  const supabase = await createClient();

  const [productsRes, storesRes, postsRes, storesCountRes, productsCountRes, activeCitiesRes] = await Promise.all([
    supabase
      .from("products")
      .select(`
        *,
        store:stores(id, name, slug, logo_url, city, state),
        category:categories(id, name, slug),
        images:product_images(id, url, position, is_cover)
      `)
      .eq("status", "active")
      .eq("is_featured", true)
      .limit(8)
      .order("created_at", { ascending: false }),
    supabase
      .from("stores")
      .select(`
        *,
        contacts:store_contacts(id, type, value, is_primary)
      `)
      .eq("status", "active")
      .limit(6)
      .order("total_sales", { ascending: false }),
    supabase
      .from("community_posts")
      .select(`*, author:profiles(id, full_name, avatar_url)`)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("stores").select("id", { count: "exact", head: true }).eq("status", "active"),
    // Conta só produtos de fato visíveis publicamente (mesma regra da policy
    // de RLS: status ativo E loja ativa) — senão o número da home promete
    // mais do que o visitante realmente encontra na vitrine.
    supabase
      .from("products")
      .select("id, stores!inner(status)", { count: "exact", head: true })
      .eq("status", "active")
      .eq("stores.status", "active"),
    supabase.from("stores").select("city").eq("status", "active"),
  ]);

  const products = (productsRes.data ?? []) as unknown as ProductWithRelations[];
  const stores = (storesRes.data ?? []) as unknown as StoreWithContacts[];
  const posts = (postsRes.data ?? []) as unknown as PostWithRelations[];

  const activeProductsCount = productsCountRes.count ?? 0;
  const distinctCitiesCount = new Set(
    ((activeCitiesRes.data ?? []) as { city: string }[]).map((s) => s.city),
  ).size;

  const heroStats: HeroStats | null =
    activeProductsCount >= MIN_ACTIVE_PRODUCTS_FOR_HOME_STATS
      ? {
          storesCount: storesCountRes.count ?? 0,
          productsCount: activeProductsCount,
          citiesCount: distinctCitiesCount,
        }
      : null;

  return (
    <>
      <Header />
      <main className="flex-1">
        <HeroSection stats={heroStats} />
        <CategoriesGrid />
        <FeaturedProducts products={products} />
        <FeaturedStores stores={stores} />
        <CommunityFeed posts={posts} />
      </main>
      <Footer />
    </>
  );
}
