import Link from "next/link";
import { CATEGORIES } from "@/lib/constants";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  ceramica: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <path d="M8 3h8l1 5H7L8 3z" />
      <path d="M7 8c0 0-2 2-2 6s2 7 7 7 7-3 7-7-2-6-2-6" />
    </svg>
  ),
  "capim-dourado": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <path d="M12 21V7" />
      <path d="M12 7c0-3-3-4-3-4s0 3 3 4z" />
      <path d="M12 11c0-3 3-4 3-4s0 3-3 4z" />
      <path d="M12 15c0-3-3-4-3-4s0 3 3 4z" />
      <path d="M9 21h6" />
    </svg>
  ),
  "rendas-bordados": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <circle cx="17" cy="4" r="2" />
      <path d="M15.5 5.5L6 15l-2 5 5-2 9.5-9.5" />
      <path d="M6 15l1.5 1.5" />
    </svg>
  ),
  couro: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <path d="M6 8h12l1 10H5L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  ),
  madeira: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <path d="M12 3L4 9v12h16V9L12 3z" />
      <path d="M12 3v18" />
      <path d="M4 9h16" />
    </svg>
  ),
  palha: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M5 6l2 12" />
      <path d="M9 6l2 12" />
      <path d="M13 6l2 12" />
      <path d="M17 6l2 12" />
    </svg>
  ),
  bijuterias: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <path d="M6 9l6-6 6 6-6 12-6-12z" />
      <path d="M6 9h12" />
    </svg>
  ),
  pinturas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <circle cx="13.5" cy="6.5" r="1.5" />
      <circle cx="17.5" cy="10.5" r="1.5" />
      <circle cx="8.5" cy="7.5" r="1.5" />
      <circle cx="6.5" cy="12.5" r="1.5" />
      <path d="M12 20a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />
    </svg>
  ),
  escultura: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <circle cx="12" cy="6" r="3" />
      <path d="M9 9v2a3 3 0 0 0 6 0V9" />
      <path d="M12 14v7" />
      <path d="M9 21h6" />
    </svg>
  ),
  outros: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
};

export function CategoriesGrid() {
  return (
    <section className="py-14 max-w-7xl mx-auto px-4">
      <h2 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] mb-8 text-center">
        Explore por categoria
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.slug}
            href={`/categorias/${cat.slug}`}
            className="group flex flex-col items-center gap-2 p-4 bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] hover:border-terracota hover:shadow-md transition-all text-center"
          >
            <span className="text-muted-foreground group-hover:text-terracota transition-colors">
              {CATEGORY_ICONS[cat.slug] ?? CATEGORY_ICONS["outros"]}
            </span>
            <span className="text-sm font-semibold text-dark dark:text-[#f5edd6] group-hover:text-terracota transition-colors">
              {cat.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
