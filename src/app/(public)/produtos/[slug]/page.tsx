"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Heart, MapPin, ChevronLeft, ChevronRight } from "lucide-react";

const WhatsAppIcon = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden="true">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.867-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
  </svg>
);
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatWhatsApp } from "@/lib/utils";
import { useCart } from "@/hooks/useCart";
import type { ProductWithRelations } from "@/types";

export default function ProdutoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<ProductWithRelations | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const { add } = useCart();

  useEffect(() => {
    const fetch = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("products")
        .select(`
          *,
          store:stores(*, contacts:store_contacts(type, value, is_primary)),
          category:categories(id, name, slug),
          images:product_images(id, url, position, is_cover)
        `)
        .eq("slug", slug)
        .eq("status", "active")
        .single();
      setProduct(data as unknown as ProductWithRelations);
      setLoading(false);
    };
    fetch();
  }, [slug]);

  if (loading) {
    return (
      <>
        <Header />
        <main className="flex-1 flex items-center justify-center min-h-[50vh]">
          <div className="animate-pulse text-muted-foreground">Carregando...</div>
        </main>
        <Footer />
      </>
    );
  }

  if (!product) {
    return (
      <>
        <Header />
        <main className="flex-1 flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <p className="text-xl font-semibold text-dark mb-4">Produto não encontrado</p>
            <Link href="/produtos" className="text-terracota hover:underline">Ver todos os produtos</Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const sortedImages = [...(product.images ?? [])].sort((a, b) => a.position - b.position);
  const images = sortedImages.length ? sortedImages : null;
  const coverUrl = images?.[imgIdx]?.url ?? "/images/placeholder-product.png";
  const storeContacts = (product.store as { contacts?: { type: string; value: string }[] } | null)?.contacts;
  const whatsapp = storeContacts?.find((c) => c.type === "whatsapp")?.value;

  const handleAddToCart = () => {
    add(product);
    toast.success("Produto adicionado ao carrinho!");
  };

  return (
    <>
      <Header />
      <main className="flex-1 max-w-7xl mx-auto px-4 py-10">
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-terracota">Home</Link>
          <span>/</span>
          <Link href="/produtos" className="hover:text-terracota">Produtos</Link>
          <span>/</span>
          <span className="text-dark">{product.name}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-12">
          {/* Gallery */}
          <div>
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-cream mb-3">
              <Image src={coverUrl} alt={product.name} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" priority />
              {images && images.length > 1 && (
                <>
                  <button onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center hover:bg-white">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => setImgIdx((i) => (i + 1) % images.length)} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center hover:bg-white">
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>
            {images && images.length > 1 && (
              <div className="flex gap-2">
                {images.map((img, i) => (
                  <button key={img.id} onClick={() => setImgIdx(i)} className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${i === imgIdx ? "border-terracota" : "border-border"}`}>
                    <Image src={img.url} alt="" fill className="object-cover" sizes="64px" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            {product.category && (
              <Badge className="mb-3 bg-terracota/10 text-terracota border-terracota/20">
                {product.category.name}
              </Badge>
            )}

            <h1 className="font-display text-3xl font-bold text-dark mb-3 leading-tight">{product.name}</h1>
            <p className="text-4xl font-black text-terracota mb-6">{formatPrice(product.price)}</p>
            <p className="text-muted-foreground leading-relaxed mb-8">{product.description}</p>

            <div className="flex flex-col gap-3 mb-8">
              {whatsapp && (
                <a href={formatWhatsApp(whatsapp, product.name)} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full h-12 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold gap-2 text-base">
                    <WhatsAppIcon size={18} /> Falar com vendedor no WhatsApp
                  </Button>
                </a>
              )}
              <Button
                onClick={handleAddToCart}
                variant="outline"
                className="w-full h-12 border-terracota text-terracota hover:bg-terracota hover:text-white font-semibold gap-2 text-base"
                disabled={product.stock === 0}
              >
                <ShoppingCart size={18} />
                {product.stock === 0 ? "Sem estoque" : "Adicionar ao carrinho"}
              </Button>
              <button onClick={() => toast.success("Produto favoritado!")} className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-terracota transition-colors">
                <Heart size={15} /> Adicionar aos favoritos
              </button>
            </div>

            {product.stock > 0 && product.stock <= 5 && (
              <p className="text-amber text-sm font-semibold mb-4">
                ⚠️ Apenas {product.stock} unidade{product.stock > 1 ? "s" : ""} disponível{product.stock > 1 ? "s" : ""}!
              </p>
            )}

            {product.store && (
              <Link href={`/lojas/${product.store.slug}`} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-border hover:border-terracota/40 transition-colors group">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-cream flex-shrink-0">
                  {product.store.logo_url ? (
                    <Image src={product.store.logo_url} alt={product.store.name} width={40} height={40} className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl">🏺</div>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-dark text-sm group-hover:text-terracota transition-colors">{product.store.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin size={11} /> {product.store.city}
                  </p>
                </div>
              </Link>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
