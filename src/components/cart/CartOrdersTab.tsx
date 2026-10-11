"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Package, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getBuyerOrderHistory, getReorderItems } from "@/actions/order-history";
import { useCart } from "@/hooks/useCart";
import { formatPrice } from "@/lib/utils";
import { PLACEHOLDER_PRODUCT_IMG } from "@/lib/constants";
import {
  BUYER_ORDER_STATUS_CLASS,
  getBuyerOrderStatus,
  getBuyerOrderStatusLabel,
} from "@/lib/order-status";
import type { BuyerOrderSummary } from "@/types/actions";

interface CartOrdersTabProps {
  /** A aba está visível: a primeira ativação carrega os pedidos. */
  active: boolean;
  onNavigate: () => void;
  onShowCart: () => void;
}

interface ReorderSummary {
  orderId: string;
  added: number;
  unavailable: string[];
  adjusted: number;
}

export function CartOrdersTab({ active, onNavigate, onShowCart }: CartOrdersTabProps) {
  const { items: cartItems, add } = useCart();
  const [orders, setOrders] = useState<BuyerOrderSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReorderSummary | null>(null);
  const started = useRef(false);

  const loadPage = useCallback(async (offset: number) => {
    setLoading(true);
    setError(null);
    const result = await getBuyerOrderHistory(offset);
    setLoading(false);
    setLoaded(true);

    if ("error" in result) {
      if (result.unauthenticated) setUnauthenticated(true);
      else setError(result.error);
      return;
    }
    setOrders((prev) => (offset === 0 ? result.orders : [...prev, ...result.orders]));
    setHasMore(result.hasMore);
  }, []);

  useEffect(() => {
    if (active && !started.current) {
      started.current = true;
      void loadPage(0);
    }
  }, [active, loadPage]);

  const handleReorder = async (orderId: string) => {
    setReorderingId(orderId);
    setSummary(null);
    const result = await getReorderItems(orderId);
    setReorderingId(null);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    let added = 0;
    let adjusted = 0;
    const unavailable = result.unavailable.map((u) => u.name);

    for (const item of result.items) {
      // Não passa do estoque somando com o que já está no carrinho.
      const inCart = cartItems.find((c) => c.product.id === item.product.id)?.quantity ?? 0;
      const room = item.product.stock - inCart;
      const quantity = Math.min(item.quantity, room);
      if (quantity < 1) {
        unavailable.push(`${item.product.name} (já no carrinho no máximo do estoque)`);
        continue;
      }
      if (quantity < item.requestedQuantity) adjusted += 1;
      add(item.product, quantity);
      added += 1;
    }

    setSummary({ orderId, added, unavailable, adjusted });
  };

  if (unauthenticated) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
        <Package size={48} className="mb-4 opacity-20" />
        <p className="text-base font-medium">Entre para ver seus pedidos</p>
        <Link
          href="/login?redirect=/pedidos"
          onClick={onNavigate}
          className="mt-5 inline-block bg-terracota hover:bg-terracota/90 text-white font-semibold text-sm px-6 py-2 rounded-full transition-colors"
        >
          Entrar
        </Link>
      </div>
    );
  }

  if (!loaded && loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Carregando pedidos...
      </div>
    );
  }

  if (error && orders.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-muted-foreground">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => loadPage(0)}
          className="mt-3 text-terracota font-semibold hover:underline cursor-pointer"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (loaded && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
        <Package size={48} className="mb-4 opacity-20" />
        <p className="text-base font-medium">Você ainda não fez pedidos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div
          role="status"
          className="rounded-xl border border-terracota/30 bg-terracota/5 px-3 py-2.5 text-sm text-dark dark:text-[#f5edd6]"
        >
          <p>
            <span className="font-semibold">
              {summary.added} {summary.added === 1 ? "item adicionado" : "itens adicionados"}
            </span>
            {summary.unavailable.length > 0 && (
              <>; indisponíveis: {summary.unavailable.join(", ")}</>
            )}
            {summary.unavailable.length === 0 && "."}
          </p>
          {summary.adjusted > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              A quantidade de {summary.adjusted === 1 ? "1 item foi ajustada" : `${summary.adjusted} itens foi ajustada`} ao
              estoque. Os preços são os de hoje.
            </p>
          )}
          {summary.added > 0 && (
            <button
              type="button"
              onClick={onShowCart}
              className="mt-2 text-xs font-semibold text-terracota hover:underline cursor-pointer"
            >
              Ver carrinho
            </button>
          )}
        </div>
      )}

      {orders.map((order) => {
        const statusKey = getBuyerOrderStatus(order.status);
        return (
          <article
            key={order.id}
            className="bg-[#faf7f2] dark:bg-[#1a1208] rounded-xl p-3 border border-border dark:border-[#3d2c1a]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-dark dark:text-[#f5edd6] truncate">
                  {order.storeNames.length > 0 ? order.storeNames.join(", ") : "Pedido"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(order.createdAt).toLocaleDateString("pt-BR")} · #{order.id.slice(0, 8)}
                </p>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${BUYER_ORDER_STATUS_CLASS[statusKey]}`}
              >
                {getBuyerOrderStatusLabel(order.status)}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-3">
              {order.previewItems.map((item, index) => (
                <div
                  key={index}
                  className="relative w-12 h-12 rounded-lg overflow-hidden bg-cream dark:bg-[#3d2c1a] flex-shrink-0"
                  title={item.name}
                >
                  <Image
                    src={item.imageUrl ?? PLACEHOLDER_PRODUCT_IMG}
                    alt={item.name}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
              ))}
              {order.extraItems > 0 && (
                <span className="text-sm font-semibold text-muted-foreground">
                  +{order.extraItems}
                </span>
              )}
              <span className="ml-auto font-bold text-terracota">
                {formatPrice(order.totalAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border dark:border-[#3d2c1a]">
              <Link
                href={`/pedidos#pedido-${order.id}`}
                onClick={onNavigate}
                className="text-sm font-semibold text-dark dark:text-[#f5edd6] hover:text-terracota transition-colors"
              >
                Ver detalhes
              </Link>
              <button
                type="button"
                onClick={() => handleReorder(order.id)}
                disabled={reorderingId !== null}
                className="flex items-center gap-1.5 text-sm font-semibold text-white bg-terracota hover:bg-terracota/90 disabled:opacity-60 rounded-full px-3.5 py-1.5 transition-colors cursor-pointer"
              >
                {reorderingId === order.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RotateCcw size={14} />
                )}
                Pedir de novo
              </button>
            </div>
          </article>
        );
      })}

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}

      {hasMore && (
        <button
          type="button"
          onClick={() => loadPage(orders.length)}
          disabled={loading}
          className="w-full text-sm font-semibold text-terracota hover:underline disabled:opacity-60 py-2 cursor-pointer"
        >
          {loading ? "Carregando..." : "Ver mais"}
        </button>
      )}
    </div>
  );
}
