"use client";

import Image from "next/image";
import { X, Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { formatPrice } from "@/lib/utils";
import { PLACEHOLDER_PRODUCT_IMG } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CartOrdersTab } from "@/components/cart/CartOrdersTab";
import { useStoresWithoutPayments } from "@/hooks/useStoresWithoutPayments";
import { STORE_WITHOUT_PAYMENTS_LABEL } from "@/lib/store-payments";

export function CartDrawer() {
  const { items, isOpen, closeCart, remove, updateQuantity, total, count } = useCart();
  const [tab, setTab] = useState<"carrinho" | "pedidos">("carrinho");
  const storeIds = useMemo(
    () => items.map((i) => i.product.store?.id).filter((id): id is string => !!id),
    [items],
  );
  // Só consulta com o carrinho aberto — o drawer existe em todas as páginas.
  const storesWithoutPayments = useStoresWithoutPayments(isOpen ? storeIds : []);
  const hasBlockedItems = storesWithoutPayments.size > 0;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-[90] transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeCart}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-[400px] bg-white dark:bg-[#2a1e0f] z-[100] flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-[#3d2c1a]">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-terracota" />
            <h2 className="font-display text-xl font-bold text-dark dark:text-[#f5edd6]">Carrinho</h2>
            {count > 0 && (
              <span className="bg-terracota text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {count}
              </span>
            )}
          </div>
          <button
            onClick={closeCart}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-cream/30 dark:hover:bg-[#3d2c1a] text-dark dark:text-[#f5edd6] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Abas */}
        <div role="tablist" className="flex border-b border-border dark:border-[#3d2c1a]">
          {(
            [
              ["carrinho", "Carrinho"],
              ["pedidos", "Pedidos"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors cursor-pointer border-b-2 ${
                tab === key
                  ? "text-terracota border-terracota"
                  : "text-muted-foreground border-transparent hover:text-dark dark:hover:text-[#f5edd6]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Pedidos */}
        <div className={`flex-1 overflow-y-auto px-6 py-4 ${tab === "pedidos" ? "" : "hidden"}`}>
          <CartOrdersTab
            active={isOpen && tab === "pedidos"}
            onNavigate={closeCart}
            onShowCart={() => setTab("carrinho")}
          />
        </div>

        {/* Items */}
        <div
          className={`flex-1 overflow-y-auto px-6 py-4 space-y-4 ${tab === "carrinho" ? "" : "hidden"}`}
        >
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 text-muted-foreground">
              <ShoppingBag size={48} className="mb-4 opacity-20" />
              <p className="text-base font-medium">Seu carrinho está vazio</p>
              <p className="text-sm mt-1">Explore produtos e adicione ao carrinho</p>
              <Link href="/produtos" onClick={closeCart}>
                <Button className="mt-6 bg-terracota hover:bg-terracota/90 text-white">
                  Explorar produtos
                </Button>
              </Link>
            </div>
          ) : (
            items.map(({ product, quantity }) => {
              const imageUrl = product.images?.[0]?.url ?? PLACEHOLDER_PRODUCT_IMG;
              return (
                <div key={product.id} className="flex gap-3 bg-[#faf7f2] dark:bg-[#1a1208] rounded-xl p-3">
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                    <Image src={imageUrl} alt={product.name} fill className="object-cover" sizes="64px" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-dark dark:text-[#f5edd6] leading-tight line-clamp-2">{product.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{product.store?.name}</p>
                    {product.store?.id && storesWithoutPayments.has(product.store.id) && (
                      <p className="text-xs font-medium text-destructive mt-0.5">{STORE_WITHOUT_PAYMENTS_LABEL}</p>
                    )}
                    <p className="text-terracota font-bold text-sm mt-1">{formatPrice(product.price)}</p>
                  </div>
                  <div className="flex flex-col items-end justify-between flex-shrink-0">
                    <button
                      onClick={() => remove(product.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="flex items-center gap-1 border border-border dark:border-[#3d2c1a] rounded-lg">
                      <button
                        onClick={() => updateQuantity(product.id, quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center hover:bg-cream/60 dark:hover:bg-[#3d2c1a] rounded-l-lg text-dark dark:text-[#f5edd6] transition-colors"
                      >
                        <Minus size={10} />
                      </button>
                      <span className="text-xs font-semibold w-5 text-center dark:text-[#f5edd6]">{quantity}</span>
                      <button
                        onClick={() => updateQuantity(product.id, quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center hover:bg-cream/60 dark:hover:bg-[#3d2c1a] rounded-r-lg text-dark dark:text-[#f5edd6] transition-colors"
                        disabled={quantity >= product.stock}
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {tab === "carrinho" && items.length > 0 && (
          <div className="border-t border-border dark:border-[#3d2c1a] px-6 py-5 space-y-4 bg-white dark:bg-[#2a1e0f]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Subtotal</span>
              <span className="font-bold text-dark dark:text-[#f5edd6] text-lg">{formatPrice(total)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Frete calculado no checkout</p>
            {hasBlockedItems ? (
              <>
                <p className="text-xs text-destructive">
                  Remova do carrinho os itens das lojas que ainda não recebem pagamentos para finalizar a compra.
                </p>
                <Button disabled className="w-full bg-terracota text-white font-semibold h-11">
                  Finalizar compra
                </Button>
              </>
            ) : (
              <Link href="/checkout" onClick={closeCart} className="block">
                <Button className="w-full bg-terracota hover:bg-terracota/90 text-white font-semibold h-11">
                  Finalizar compra
                </Button>
              </Link>
            )}
            <button
              onClick={closeCart}
              className="w-full text-sm text-muted-foreground hover:text-dark dark:hover:text-[#f5edd6] transition-colors"
            >
              Continuar comprando
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
