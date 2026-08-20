"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { useCart } from "@/hooks/useCart";
import { LikeButton } from "@/components/community/LikeButton";
import type { ProductWithRelations } from "@/types";

interface ProductCardProps {
  product: ProductWithRelations;
}

export function ProductCard({ product }: ProductCardProps) {
  const { add, openCart } = useCart();
  const categoryLabel = product.category?.name ?? null;
  const imageUrl = product.images?.[0]?.url ?? "/images/placeholder-product.png";

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    add(product);
    openCart();
  };

  return (
    <Link href={`/produtos/${product.slug}`} className="group block">
      <div
        className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-terracota/30"
        style={{ borderRadius: "16px", transform: "translateY(0)" }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-4px)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      >
        {/* Image */}
        <div className="relative overflow-hidden bg-cream dark:bg-[#3d2c1a]" style={{ height: "220px" }}>
          <Image
            src={imageUrl}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
          <LikeButton targetId={product.id} target="product" variant="floating" />
          {categoryLabel && (
            <span
              className="absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: "#fff2e8", color: "#c75a00" }}
            >
              {categoryLabel}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="p-4">
          <p className="text-xs text-muted-foreground mb-1 truncate">{product.store?.name ?? ""}</p>
          <h3
            className="font-semibold text-dark dark:text-[#f5edd6] leading-snug line-clamp-2 mb-1"
            style={{ fontSize: "18px" }}
          >
            {product.name}
          </h3>
          {product.description && (
            <p className="line-clamp-2 mb-2 text-[#666] dark:text-[#c4a882]" style={{ fontSize: "14px" }}>
              {product.description}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 mt-3">
            <span className="font-bold text-terracota" style={{ fontSize: "20px" }}>
              {formatPrice(product.price)}
            </span>
            <button
              onClick={handleAddToCart}
              className="w-9 h-9 bg-terracota text-white rounded-full flex items-center justify-center hover:bg-terracota/90 transition-colors flex-shrink-0 shadow-sm"
              disabled={product.stock === 0}
            >
              <ShoppingCart size={15} />
            </button>
          </div>
          {product.stock === 0 && (
            <p className="text-xs text-muted-foreground mt-1">Sem estoque</p>
          )}
        </div>
      </div>
    </Link>
  );
}
