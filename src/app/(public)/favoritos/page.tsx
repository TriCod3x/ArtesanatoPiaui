import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/product/ProductCard";
import { StoreCard } from "@/components/store/StoreCard";
import type { ProductWithRelations, StoreWithContacts } from "@/types";

export const dynamic = "force-dynamic";

interface FavoriteRow {
  id: string;
  product: ProductWithRelations | null;
  store: (StoreWithContacts & { status?: string }) | null;
}

export default async function FavoritosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/favoritos");

  const { data } = await supabase
    .from("favorites")
    .select(
      `
      id,
      product:products(
        *,
        store:stores(id, name, slug, logo_url, city, state),
        category:categories(id, name, slug),
        images:product_images(id, url, position, is_cover)
      ),
      store:stores(
        *,
        contacts:store_contacts(id, type, value, is_primary)
      )
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as FavoriteRow[];
  const products = rows
    .map((r) => r.product)
    .filter((p): p is ProductWithRelations => !!p && p.status === "active");
  const stores = rows
    .map((r) => r.store)
    .filter((s): s is StoreWithContacts => !!s && s.status === "active");

  const isEmpty = products.length === 0 && stores.length === 0;

  return (
    <>
      <Header />
      <main className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <header className="mb-8">
            <h1 className="font-display text-4xl font-bold text-dark dark:text-[#f5edd6]">
              Favoritos
            </h1>
            <p className="text-muted-foreground mt-1">
              Produtos e lojas que você salvou para ver depois.
            </p>
          </header>

          {isEmpty ? (
            <div
              className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm py-16 px-6 text-center max-w-lg mx-auto"
              style={{ borderRadius: "16px" }}
            >
              <div className="w-16 h-16 rounded-full bg-terracota/10 flex items-center justify-center mx-auto mb-4">
                <Heart size={28} className="text-terracota" />
              </div>
              <p className="font-display text-xl font-bold text-dark dark:text-[#f5edd6]">
                Você ainda não favoritou nada
              </p>
              <p className="text-sm text-muted-foreground mt-2 mb-5">
                Toque no coração em qualquer produto ou loja para guardar aqui.
              </p>
              <Link
                href="/produtos"
                className="inline-block bg-terracota hover:bg-terracota/90 text-white font-semibold text-sm px-6 py-2 rounded-full transition-colors"
              >
                Explorar produtos
              </Link>
            </div>
          ) : (
            <div className="space-y-12">
              {products.length > 0 && (
                <section>
                  <h2 className="font-display text-2xl font-bold text-dark dark:text-[#f5edd6] mb-6">
                    Produtos ({products.length})
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                    {products.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </section>
              )}

              {stores.length > 0 && (
                <section>
                  <h2 className="font-display text-2xl font-bold text-dark dark:text-[#f5edd6] mb-6">
                    Lojas ({stores.length})
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                    {stores.map((store) => (
                      <StoreCard key={store.id} store={store} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
