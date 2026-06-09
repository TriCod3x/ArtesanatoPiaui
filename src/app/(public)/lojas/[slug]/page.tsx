import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/product/ProductCard";
import { formatWhatsApp } from "@/lib/utils";
import { MapPin, Star } from "lucide-react";
import type { StoreWithContacts, ProductWithRelations } from "@/types";

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

export default async function LojaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

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

  const { data: productsData } = await supabase
    .from("products")
    .select(`
      *,
      category:categories(id, name, slug),
      images:product_images(id, url, position, is_cover)
    `)
    .eq("store_id", store.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const products = (productsData ?? []).map((p) => ({
    ...p,
    store,
  })) as unknown as ProductWithRelations[];

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
            <div className="flex gap-2 flex-wrap">
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

          {/* Description */}
          {store.description && (
            <div className="mb-10">
              <h2 className="font-semibold text-dark dark:text-[#f5edd6] mb-2">Sobre a loja</h2>
              <p className="text-muted-foreground leading-relaxed max-w-2xl">{store.description}</p>
            </div>
          )}

          {/* Products */}
          <h2 className="font-display text-2xl font-bold text-dark dark:text-[#f5edd6] mb-6">
            Produtos ({products.length})
          </h2>
          {products.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center">Esta loja ainda não tem produtos.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mb-12">
              {products.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
