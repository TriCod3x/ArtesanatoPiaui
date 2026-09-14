"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { searchProducts, type ProductSearchResult } from "@/actions/search";
import { formatPrice, cn } from "@/lib/utils";
import { PLACEHOLDER_PRODUCT_IMG } from "@/lib/constants";
import { Input } from "@/components/ui/input";

interface SearchDropdownProps {
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

export function SearchDropdown({ className, inputClassName, placeholder }: SearchDropdownProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_CHARS) return;

    const requestId = ++requestIdRef.current;
    const timer = setTimeout(() => {
      searchProducts(trimmed).then((data) => {
        if (requestIdRef.current === requestId) {
          setResults(data);
          setLoading(false);
          setActiveIndex(-1);
        }
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setOpen(true);

    if (value.trim().length < MIN_CHARS) {
      setResults([]);
      setLoading(false);
      setActiveIndex(-1);
    } else {
      setLoading(true);
    }
  };

  useEffect(() => {
    if (!open) return;

    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const reset = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
  };

  const goToFullResults = (term: string) => {
    setOpen(false);
    router.push(`/produtos?busca=${encodeURIComponent(term)}`);
  };

  const goToProduct = (slug: string) => {
    reset();
    router.push(`/produtos/${slug}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    if (activeIndex >= 0 && results[activeIndex]) {
      goToProduct(results[activeIndex].slug);
    } else {
      goToFullResults(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    }
  };

  const showDropdown = open && query.trim().length >= MIN_CHARS;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <form onSubmit={handleSubmit} role="search">
        <Input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Buscar produtos..."}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="header-search-listbox"
          aria-autocomplete="list"
          autoComplete="off"
          className={cn(
            "bg-cream/10 border-cream/20 text-cream placeholder:text-cream/50 pr-10 focus-visible:ring-terracota",
            inputClassName,
          )}
        />
        <button
          type="submit"
          aria-label="Buscar"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/60 hover:text-cream"
        >
          <Search size={16} />
        </button>
      </form>

      {showDropdown && (
        <div
          id="header-search-listbox"
          role="listbox"
          className="absolute left-0 right-0 mt-2 max-h-[26rem] overflow-y-auto rounded-xl border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] shadow-lg z-50"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              Buscando...
            </div>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-muted-foreground">
              Nenhum produto encontrado para &quot;{query.trim()}&quot;
            </p>
          ) : (
            <>
              <ul>
                {results.map((product, i) => (
                  <li key={product.id} role="option" aria-selected={i === activeIndex}>
                    <Link
                      href={`/produtos/${product.slug}`}
                      onClick={() => reset()}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 transition-colors",
                        i === activeIndex
                          ? "bg-cream dark:bg-[#3d2c1a]"
                          : "hover:bg-cream dark:hover:bg-[#3d2c1a]",
                      )}
                    >
                      <span className="relative w-10 h-10 rounded-lg overflow-hidden bg-cream dark:bg-[#3d2c1a] flex-shrink-0">
                        <Image
                          src={product.imageUrl ?? PLACEHOLDER_PRODUCT_IMG}
                          alt={product.name}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-dark dark:text-[#f5edd6] truncate">
                          {product.name}
                        </span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {product.storeName ?? ""}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-terracota flex-shrink-0">
                        {formatPrice(product.price)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => goToFullResults(query.trim())}
                className="w-full text-center text-sm text-terracota font-medium py-2.5 border-t border-border dark:border-[#3d2c1a] hover:bg-cream dark:hover:bg-[#3d2c1a] transition-colors"
              >
                Ver todos os resultados
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
