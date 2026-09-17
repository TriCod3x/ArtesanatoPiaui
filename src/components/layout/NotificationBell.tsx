"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Bell, ArrowRight } from "lucide-react";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "@/actions/notifications";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types";

export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Revalida a contagem de não lidas a cada navegação, já que o painel só
  // busca a lista completa sob demanda (ao abrir).
  useEffect(() => {
    getUnreadCount().then(setUnreadCount);
  }, [pathname]);

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

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && notifications === null) {
      setLoading(true);
      getNotifications()
        .then(setNotifications)
        .finally(() => setLoading(false));
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    setOpen(false);
    if (!notification.read_at) {
      setNotifications(
        (prev) =>
          prev?.map((n) =>
            n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n,
          ) ?? prev,
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      await markAsRead(notification.id);
    }
    if (notification.link) router.push(notification.link);
  };

  const handleMarkAllAsRead = async () => {
    setNotifications(
      (prev) => prev?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? prev,
    );
    setUnreadCount(0);
    await markAllAsRead();
  };

  const hasUnread = notifications?.some((n) => !n.read_at) ?? false;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Notificações"
        className="relative flex items-center justify-center w-10 h-10 rounded-full text-cream hover:text-terracota hover:bg-cream/10 transition-colors cursor-pointer"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 bg-destructive text-white text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] shadow-lg z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border dark:border-[#3d2c1a]">
            <p className="text-sm font-semibold text-dark dark:text-[#f5edd6]">Notificações</p>
            {hasUnread && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="text-xs font-medium text-terracota hover:underline cursor-pointer flex-shrink-0"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <p className="px-3 py-6 text-sm text-center text-muted-foreground">Carregando...</p>
            )}
            {!loading && notifications?.length === 0 && (
              <p className="px-3 py-6 text-sm text-center text-muted-foreground">
                Nenhuma notificação por enquanto
              </p>
            )}
            {!loading &&
              notifications?.map((notification) => (
                <div
                  key={notification.id}
                  role="menuitem"
                  tabIndex={0}
                  onClick={() => handleNotificationClick(notification)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleNotificationClick(notification);
                    }
                  }}
                  className={cn(
                    "w-full text-left px-3 py-3 border-b border-border dark:border-[#3d2c1a] last:border-0 hover:bg-cream dark:hover:bg-[#3d2c1a] transition-colors cursor-pointer flex gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota",
                    !notification.read_at && "bg-terracota/5 dark:bg-terracota/10",
                  )}
                >
                  <div className="w-2 flex-shrink-0 flex justify-center pt-1.5">
                    {!notification.read_at && (
                      <span className="w-2 h-2 rounded-full bg-terracota" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-dark dark:text-[#f5edd6] truncate">
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className="text-xs text-muted-foreground dark:text-[#8a6a4a] line-clamp-2 mt-0.5">
                        {notification.message}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <RelativeTime
                        date={notification.created_at}
                        className="text-[11px] text-muted-foreground dark:text-[#8a6a4a]"
                      />
                      {notification.link && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNotificationClick(notification);
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-white bg-terracota hover:bg-terracota/90 rounded-full px-2.5 py-1 transition-colors cursor-pointer flex-shrink-0"
                        >
                          Ver <ArrowRight size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
