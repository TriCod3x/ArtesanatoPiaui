"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Flag,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Package,
  Heart,
  ShieldCheck,
  Star,
  Store,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getUnreadMessagesCount } from "@/actions/messages";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

interface UserMenuProps {
  userId: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: Role | null;
}

const UNREAD_FALLBACK_POLL_MS = 30_000;

export function UserMenu({ userId, fullName, avatarUrl, role }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // null = ainda descobrindo; evita piscar "Vender aqui" pra quem tem loja.
  const [hasStore, setHasStore] = useState<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const firstName = fullName?.trim().split(" ")[0] || "Minha conta";
  const initial = fullName?.trim()?.[0]?.toUpperCase() ?? "?";

  // Contador de não lidas: busca ao montar e acompanha por Realtime (a RLS
  // filtra as mensagens do usuário); com a conexão fora, busca a cada 30 s.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let connected = false;

    const refresh = () => {
      getUnreadMessagesCount().then(setUnreadCount);
    };
    refresh();

    const channel = supabase
      .channel("chat:unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(refresh, 500);
      })
      .subscribe((status) => {
        connected = status === "SUBSCRIBED";
      });

    const poll = setInterval(() => {
      if (!connected) refresh();
    }, UNREAD_FALLBACK_POLL_MS);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    createClient()
      .from("stores")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setHasStore((data?.length ?? 0) > 0);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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

  const handleSignOut = async () => {
    setOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const items: {
    href?: string;
    label: string;
    icon: typeof User;
    onClick?: () => void;
    show: boolean;
    badge?: number;
  }[] = [
    { href: "/perfil", label: "Meu perfil", icon: User, show: true },
    { href: "/mensagens", label: "Mensagens", icon: MessageCircle, show: true, badge: unreadCount },
    { href: "/favoritos", label: "Favoritos", icon: Heart, show: true },
    { href: "/pedidos", label: "Meus pedidos", icon: Package, show: true },
    { href: "/minhas-avaliacoes", label: "Minhas avaliações", icon: Star, show: true },
    // Quem tem loja vê "Minha loja" (o painel); quem ainda não vende vê o convite.
    { href: "/dashboard", label: "Minha loja", icon: LayoutDashboard, show: hasStore === true },
    { href: "/vender", label: "Vender aqui", icon: Store, show: hasStore === false },
    {
      href: "/admin/lojas",
      label: "Administração",
      icon: ShieldCheck,
      show: role === "admin",
    },
    {
      href: "/admin/denuncias",
      label: "Denúncias do chat",
      icon: Flag,
      show: role === "admin",
    },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-cream hover:bg-cream/10 transition-colors cursor-pointer"
      >
        <span className="w-8 h-8 rounded-full overflow-hidden bg-terracota/20 flex items-center justify-center flex-shrink-0 relative">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={firstName}
              fill
              className="object-cover"
              sizes="32px"
            />
          ) : (
            <span className="text-sm font-bold text-cream">{initial}</span>
          )}
        </span>
        <span className="hidden sm:block text-sm font-medium max-w-[120px] truncate">
          {firstName}
        </span>
        <ChevronDown
          size={15}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] shadow-lg py-1.5 z-50"
        >
          <div className="px-3 py-2 border-b border-border dark:border-[#3d2c1a]">
            <p className="text-sm font-semibold text-dark dark:text-[#f5edd6] truncate">
              {fullName?.trim() || "Minha conta"}
            </p>
          </div>

          {items
            .filter((i) => i.show)
            .map((item) => (
              <Link
                key={item.label}
                href={item.href ?? "#"}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-dark dark:text-[#f5edd6] hover:bg-cream dark:hover:bg-[#3d2c1a] transition-colors"
              >
                <item.icon size={16} className="text-terracota" />
                {item.label}
                {!!item.badge && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-terracota text-white text-[10px] font-bold flex items-center justify-center">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </Link>
            ))}

          <div className="border-t border-border dark:border-[#3d2c1a] mt-1 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-dark dark:text-[#f5edd6] hover:bg-cream dark:hover:bg-[#3d2c1a] transition-colors cursor-pointer"
            >
              <LogOut size={16} className="text-terracota" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
