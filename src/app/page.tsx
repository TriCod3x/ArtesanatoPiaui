import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { CategoriesGrid } from "@/components/home/CategoriesGrid";
import { FeaturedProducts } from "@/components/home/FeaturedProducts";
import { FeaturedStores } from "@/components/home/FeaturedStores";
import { CommunityFeed } from "@/components/home/CommunityFeed";
import type { ProductWithRelations, StoreWithContacts, CommunityPost } from "@/types";

export default async function HomePage() {
  const supabase = await createClient();

  const [productsRes, storesRes, postsRes] = await Promise.all([
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
      .from("posts")
      .select(`*, store:stores(name, slug, logo_url)`)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const products = (productsRes.data ?? []) as unknown as ProductWithRelations[];
  const stores = (storesRes.data ?? []) as unknown as StoreWithContacts[];
  const posts = (postsRes.data ?? []) as unknown as CommunityPost[];

  return (
    <>
      <Header />
      <main className="flex-1">
        <HeroSection />
        <CategoriesGrid />
        <FeaturedProducts products={products} />
        <FeaturedStores stores={stores} />
        <CommunityFeed posts={posts} />
      </main>
      <Footer />
    </>
  );
}
