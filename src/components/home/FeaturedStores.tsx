import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StoreCard } from "@/components/store/StoreCard";
import type { Store } from "@/types";

interface FeaturedStoresProps {
  stores: Store[];
}

export function FeaturedStores({ stores }: FeaturedStoresProps) {
  if (!stores.length) return null;

  return (
    <section className="py-14 max-w-7xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">
          Lojas em destaque
        </h2>
        <Link
          href="/lojas"
          className="flex items-center gap-1 text-terracota font-semibold text-sm hover:underline"
        >
          Ver todas <ArrowRight size={16} />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
        {stores.map((store) => (
          <StoreCard key={store.id} store={store} />
        ))}
      </div>
    </section>
  );
}
