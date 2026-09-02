"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { QrCode, CreditCard, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createOrder } from "@/actions/orders";
import { createPayment } from "@/actions/payments";
import { CardForm } from "@/components/checkout/CardForm";
import type { PaymentMethod } from "@/types";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, total, clear } = useCart();
  const { user, loading: authLoading } = useAuth();
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Guarda de hidratação: o carrinho só existe no cliente (localStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { storeName: string; items: typeof items; subtotal: number }
    >();
    for (const item of items) {
      const storeId = item.product.store?.id ?? item.product.store_id;
      const g = map.get(storeId) ?? {
        storeName: item.product.store?.name ?? "Loja",
        items: [],
        subtotal: 0,
      };
      g.items.push(item);
      g.subtotal += item.product.price * item.quantity;
      map.set(storeId, g);
    }
    return [...map.values()];
  }, [items]);

  if (!mounted || authLoading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 flex justify-center">
        <Loader2 className="animate-spin text-terracota" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-lg font-semibold text-dark dark:text-[#f5edd6] mb-4">
          Entre na sua conta para finalizar a compra
        </p>
        <Link href="/login?redirect=/checkout">
          <Button className="bg-terracota hover:bg-terracota/90 text-white">Entrar</Button>
        </Link>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-lg font-semibold text-dark dark:text-[#f5edd6] mb-2">
          Seu carrinho está vazio
        </p>
        <Link href="/produtos" className="text-terracota hover:underline">
          Explorar produtos
        </Link>
      </main>
    );
  }

  async function pay(cardToken?: string, installments?: number) {
    setSubmitting(true);
    const orderRes = await createOrder(
      items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
    );
    if (orderRes.error || !orderRes.orderId) {
      setSubmitting(false);
      toast.error(orderRes.error ?? "Erro ao criar o pedido.");
      return;
    }

    const payRes = await createPayment({
      orderId: orderRes.orderId,
      method,
      cardToken,
      installments,
    });

    if (payRes.error) {
      setSubmitting(false);
      toast.error(payRes.error);
      // O pedido ficou pending — leva o comprador pra tela do pedido pra tentar de novo.
      router.push(`/pedidos/${orderRes.orderId}`);
      return;
    }

    clear();
    router.push(`/pedidos/${orderRes.orderId}`);
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <Link
        href="/produtos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-terracota mb-6"
      >
        <ArrowLeft size={15} /> Continuar comprando
      </Link>

      <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] mb-8">
        Finalizar compra
      </h1>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
        {/* Revisão do carrinho */}
        <div className="space-y-5">
          {groups.map((g, gi) => (
            <div
              key={gi}
              className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-5"
            >
              <p className="text-sm font-semibold text-dark dark:text-[#f5edd6] mb-3">
                {g.storeName}
              </p>
              <div className="space-y-3">
                {g.items.map(({ product, quantity }) => (
                  <div key={product.id} className="flex gap-3">
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-cream">
                      <Image
                        src={product.images?.[0]?.url ?? "/images/placeholder-product.png"}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-dark dark:text-[#f5edd6] line-clamp-1">
                        {product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {quantity} × {formatPrice(product.price)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-dark dark:text-[#f5edd6]">
                      {formatPrice(product.price * quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Método de pagamento */}
          <div className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-5">
            <p className="text-sm font-semibold text-dark dark:text-[#f5edd6] mb-3">
              Forma de pagamento
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMethod("pix")}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  method === "pix"
                    ? "border-terracota bg-terracota/5 ring-1 ring-terracota"
                    : "border-border dark:border-[#3d2c1a] hover:border-terracota/40"
                }`}
              >
                <QrCode size={20} className="text-terracota mb-2" />
                <p className="text-sm font-semibold text-dark dark:text-[#f5edd6]">Pix</p>
                <p className="text-xs text-muted-foreground">Aprovação na hora</p>
              </button>
              <button
                type="button"
                onClick={() => setMethod("credit_card")}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  method === "credit_card"
                    ? "border-terracota bg-terracota/5 ring-1 ring-terracota"
                    : "border-border dark:border-[#3d2c1a] hover:border-terracota/40"
                }`}
              >
                <CreditCard size={20} className="text-terracota mb-2" />
                <p className="text-sm font-semibold text-dark dark:text-[#f5edd6]">
                  Cartão de crédito
                </p>
                <p className="text-xs text-muted-foreground">Em até 12×</p>
              </button>
            </div>

            {method === "credit_card" && (
              <div className="mt-5">
                <CardForm total={total} disabled={submitting} onToken={pay} />
              </div>
            )}
          </div>
        </div>

        {/* Resumo */}
        <aside className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-6 lg:sticky lg:top-24">
          <p className="font-semibold text-dark dark:text-[#f5edd6] mb-4">Resumo</p>
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Itens ({items.length})</span>
            <span>{formatPrice(total)}</span>
          </div>
          <div className="flex justify-between font-bold text-dark dark:text-[#f5edd6] text-lg pt-3 border-t border-border dark:border-[#3d2c1a] mb-5">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>

          {method === "pix" ? (
            <Button
              onClick={() => pay()}
              disabled={submitting}
              className="w-full bg-terracota hover:bg-terracota/90 text-white font-semibold h-11 gap-2"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              Gerar Pix
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              Preencha os dados do cartão ao lado para concluir.
            </p>
          )}

          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-4">
            <ShieldCheck size={13} /> Pagamento processado pela Pagar.me
          </p>
        </aside>
      </div>
    </main>
  );
}
