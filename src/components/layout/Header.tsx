"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingCart, Menu, X, LayoutDashboard, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useTheme } from "@/components/shared/ThemeProvider";
import { UserMenu } from "@/components/layout/UserMenu";
import { SearchDropdown } from "@/components/layout/SearchDropdown";
import { NotificationBell } from "@/components/layout/NotificationBell";

export function Header() {
  const { user, profile, role } = useAuth();
  const { count, openCart } = useCart();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

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

        {/* Nav — desktop */}
        <nav className="hidden lg:flex items-center gap-5 flex-shrink-0">
          <Link href="/produtos" className="text-sm font-medium text-cream/90 hover:text-terracota transition-colors">
            Produtos
          </Link>
          <Link href="/lojas" className="text-sm font-medium text-cream/90 hover:text-terracota transition-colors">
            Lojas
          </Link>
          <Link href="/comunidade" className="text-sm font-medium text-cream/90 hover:text-terracota transition-colors">
            Comunidade
          </Link>
        </nav>

        {/* Search — desktop */}
        <SearchDropdown
          className="hidden md:block flex-1 max-w-xl mx-auto"
          placeholder="Buscar produtos..."
        />

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1">
          {/* Theme toggle — claro ↔ escuro */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="text-cream hover:text-terracota hover:bg-cream/10 transition-colors duration-300"
            title={theme === "dark" ? "Mudar para o modo claro" : "Mudar para o modo escuro"}
            aria-label={theme === "dark" ? "Mudar para o modo claro" : "Mudar para o modo escuro"}
          >
            {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
          </Button>

          {user ? (
            <>
              <NotificationBell />

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

              <UserMenu
                fullName={profile?.full_name ?? null}
                avatarUrl={profile?.avatar_url ?? null}
                role={role}
              />
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
        <SearchDropdown placeholder="Buscar produtos..." />
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="md:hidden bg-dark dark:bg-[#110c05] border-t border-cream/10 px-4 py-4 flex flex-col gap-2 transition-colors duration-300">
          <Link href="/produtos" className="text-cream hover:text-terracota py-2" onClick={() => setMenuOpen(false)}>Produtos</Link>
          <Link href="/lojas" className="text-cream hover:text-terracota py-2" onClick={() => setMenuOpen(false)}>Lojas</Link>
          <Link href="/comunidade" className="text-cream hover:text-terracota py-2" onClick={() => setMenuOpen(false)}>Comunidade</Link>
          {!user && (
            <>
              <Link href="/login" className="text-cream hover:text-terracota py-2" onClick={() => setMenuOpen(false)}>Entrar</Link>
              <Link href="/cadastro" className="text-terracota font-semibold py-2" onClick={() => setMenuOpen(false)}>Cadastrar</Link>
            </>
          )}
          {user && (
            <>
              <Link href="/perfil" className="text-cream hover:text-terracota py-2" onClick={() => setMenuOpen(false)}>Meu perfil</Link>
              <Link href="/favoritos" className="text-cream hover:text-terracota py-2" onClick={() => setMenuOpen(false)}>Favoritos</Link>
              <Link href="/pedidos" className="text-cream hover:text-terracota py-2" onClick={() => setMenuOpen(false)}>Meus pedidos</Link>
              {(role === "seller" || role === "admin") && (
                <Link href="/dashboard" className="text-cream hover:text-terracota py-2 flex items-center gap-2" onClick={() => setMenuOpen(false)}>
                  <LayoutDashboard size={16} /> Dashboard
                </Link>
              )}
            </>
          )}
        </nav>
      )}
    </header>
  );
}
