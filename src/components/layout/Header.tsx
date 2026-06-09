"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShoppingCart, Heart, Menu, X, Search, LogOut, LayoutDashboard, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useTheme } from "@/components/shared/ThemeProvider";
import { createClient } from "@/lib/supabase/client";

const THEME_CYCLE = ["light", "dark", "system"] as const;
type Theme = (typeof THEME_CYCLE)[number];

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "dark") return <Moon size={18} />;
  if (theme === "system") return <Monitor size={18} />;
  return <Sun size={18} />;
}

export function Header() {
  const { user, profile, role } = useAuth();
  const { count, openCart } = useCart();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme as Theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/produtos?q=${encodeURIComponent(search.trim())}`);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const displayName = profile?.full_name?.split(" ")[0] ?? "você";

  return (
    <header className="sticky top-0 z-50 bg-dark dark:bg-[#110c05] border-b border-dark/20 dark:border-[#3d2c1a] shadow-sm transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex-shrink-0 flex items-center gap-2">
          <span className="font-display text-xl font-black text-cream leading-none">
            Artesanatos<br />
            <span className="text-terracota">Piauí</span>
          </span>
        </Link>

        {/* Search — desktop */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-xl mx-auto relative">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produtos, lojas, categorias..."
            className="bg-cream/10 border-cream/20 text-cream placeholder:text-cream/50 pr-10 focus-visible:ring-terracota"
          />
          <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/60 hover:text-cream">
            <Search size={16} />
          </button>
        </form>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            className="text-cream hover:text-terracota hover:bg-cream/10 transition-colors duration-300"
            title={`Tema: ${theme}`}
          >
            <ThemeIcon theme={theme as Theme} />
          </Button>

          {user ? (
            <>
              <span className="hidden md:block text-sm text-cream/80 mr-2">Olá, {displayName}</span>

              {role === "seller" && (
                <Link href="/dashboard">
                  <Button variant="ghost" size="icon" className="text-cream hover:text-terracota hover:bg-cream/10" title="Dashboard">
                    <LayoutDashboard size={20} />
                  </Button>
                </Link>
              )}

              <Link href="/favoritos">
                <Button variant="ghost" size="icon" className="text-cream hover:text-terracota hover:bg-cream/10">
                  <Heart size={20} />
                </Button>
              </Link>

              <Button
                variant="ghost"
                size="icon"
                onClick={openCart}
                className="relative text-cream hover:text-terracota hover:bg-cream/10"
              >
                <ShoppingCart size={20} />
                {count > 0 && (
                  <span className="absolute -top-1 -right-1 bg-terracota text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                className="text-cream hover:text-terracota hover:bg-cream/10"
                title="Sair"
              >
                <LogOut size={20} />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={openCart}
                className="relative text-cream hover:text-terracota hover:bg-cream/10"
              >
                <ShoppingCart size={20} />
                {count > 0 && (
                  <span className="absolute -top-1 -right-1 bg-terracota text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </Button>
              <Link href="/vender" className="hidden md:block">
                <Button size="sm" variant="outline" className="bg-transparent border-cream/30 text-cream hover:bg-cream/10 hover:text-cream">
                  Vender aqui
                </Button>
              </Link>
              <Link href="/login">
                <Button size="sm" className="bg-terracota hover:bg-terracota/90 text-white hidden md:flex">
                  Entrar
                </Button>
              </Link>
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-cream hover:bg-cream/10"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>

      {/* Mobile search */}
      <div className="md:hidden px-4 pb-3">
        <form onSubmit={handleSearch} className="relative">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produtos..."
            className="bg-cream/10 border-cream/20 text-cream placeholder:text-cream/50 pr-10 focus-visible:ring-terracota"
          />
          <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/60 hover:text-cream">
            <Search size={16} />
          </button>
        </form>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="md:hidden bg-dark dark:bg-[#110c05] border-t border-cream/10 px-4 py-4 flex flex-col gap-2 transition-colors duration-300">
          <Link href="/produtos" className="text-cream hover:text-terracota py-2" onClick={() => setMenuOpen(false)}>Produtos</Link>
          <Link href="/lojas" className="text-cream hover:text-terracota py-2" onClick={() => setMenuOpen(false)}>Lojas</Link>
          {!user && (
            <>
              <Link href="/login" className="text-cream hover:text-terracota py-2" onClick={() => setMenuOpen(false)}>Entrar</Link>
              <Link href="/cadastro" className="text-terracota font-semibold py-2" onClick={() => setMenuOpen(false)}>Cadastrar</Link>
            </>
          )}
          {user && role === "seller" && (
            <Link href="/dashboard" className="text-cream hover:text-terracota py-2 flex items-center gap-2" onClick={() => setMenuOpen(false)}>
              <LayoutDashboard size={16} /> Dashboard
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
