import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product } from "@/types";

interface FeaturedProductsProps {
  products: Product[];
}

export function FeaturedProducts({ products }: FeaturedProductsProps) {
  if (!products.length) return null;

  return (
    <section className="py-14 bg-white dark:bg-[#1a1208] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">
            Produtos em destaque
          </h2>
          <Link
            href="/produtos"
            className="flex items-center gap-1 text-terracota font-semibold text-sm hover:underline"
          >
            Ver todos <ArrowRight size={16} />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
