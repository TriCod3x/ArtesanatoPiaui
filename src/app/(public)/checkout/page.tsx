"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Store, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useCart } from "@/hooks/useCart";
import { formatPrice } from "@/lib/utils";
import { PLACEHOLDER_PRODUCT_IMG } from "@/lib/constants";
import { createOrder } from "@/actions/orders";
import { createPayment, getOrderPaymentStatus } from "@/actions/payments";
import { PixPayment } from "@/components/checkout/PixPayment";
import { CardCheckoutButton } from "@/components/checkout/CardCheckoutButton";
import type { PaymentMethod, PaymentStatus, StorePaymentResult } from "@/types";

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items, total, clear } = useCart();

  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(() => searchParams.get("order"));
  const [payments, setPayments] = useState<StorePaymentResult[] | null>(null);

  useEffect(() => {
    if (!orderId) return;
    getOrderPaymentStatus(orderId).then((results) => {
      if (results.length > 0) setPayments(results);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = Object.values(
    items.reduce<Record<string, { storeId: string; storeName: string; items: typeof items; subtotal: number }>>(
      (acc, item) => {
        const storeId = item.product.store?.id ?? "sem-loja";
        const storeName = item.product.store?.name ?? "Loja";
        if (!acc[storeId]) acc[storeId] = { storeId, storeName, items: [], subtotal: 0 };
        acc[storeId].items.push(item);
        acc[storeId].subtotal += item.product.price * item.quantity;
        return acc;
      },
      {},
    ),
  );

  const runCheckout = async (selectedMethod: PaymentMethod) => {
    setSubmitting(true);
    setMethod(selectedMethod);

    let currentOrderId = orderId;
    if (!currentOrderId) {
      const orderResult = await createOrder(
        items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
      );
      if ("error" in orderResult) {
        toast.error(orderResult.error);
        setSubmitting(false);
        return;
      }
      currentOrderId = orderResult.orderId;
      setOrderId(currentOrderId);
      router.replace(`/checkout?order=${currentOrderId}`);
    }

    const paymentResult = await createPayment(currentOrderId, selectedMethod);
    setSubmitting(false);

    if ("error" in paymentResult) {
      toast.error(paymentResult.error);
      return;
    }

    setPayments(paymentResult.payments);
    clear();

    const anyBlocked = paymentResult.payments.some((p) => p.error);
    if (anyBlocked) toast.warning("Um ou mais lojas não puderam gerar o pagamento.");
  };

  const updatePaymentStatus = (storeId: string, status: PaymentStatus) => {
    setPayments((prev) => (prev ?? []).map((p) => (p.storeId === storeId ? { ...p, status } : p)));
  };

  if (payments) {
    const orderTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    const allPaid = payments.every((p) => p.status === "paid");

    return (
      <>
        <Header />
        <main className="flex-1 bg-background">
          <div className="max-w-2xl mx-auto px-4 py-10">
            <header className="mb-8">
              <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">Pagamento</h1>
              <p className="text-muted-foreground mt-1">
                Pedido #{orderId?.slice(0, 8)} · Total {formatPrice(orderTotal)}
              </p>
            </header>

            {allPaid ? (
              <div
                className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm py-12 px-6 text-center"
                style={{ borderRadius: "16px" }}
              >
                <p className="font-display text-xl font-bold text-dark dark:text-[#f5edd6]">
                  Pagamento confirmado! 🎉
                </p>
                <Link
                  href="/pedidos"
                  className="inline-block mt-5 bg-terracota hover:bg-terracota/90 text-white font-semibold text-sm px-6 py-2 rounded-full transition-colors"
                >
                  Ver meus pedidos
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {payments.map((p) =>
                  p.error ? (
                    <div
                      key={p.storeId}
                      className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl px-4 py-3"
                    >
                      {p.error}
                    </div>
                  ) : p.method === "pix" ? (
                    <PixPayment
                      key={p.storeId}
                      orderId={orderId!}
                      storeId={p.storeId}
                      storeName={p.storeName}
                      amount={p.amount}
                      qrCode={p.pixQrCode}
                      qrCodeBase64={p.pixQrCodeBase64}
                      expiresAt={p.pixExpiresAt}
                      status={p.status}
                      onStatusChange={(status) => updatePaymentStatus(p.storeId, status)}
                      onRegenerate={() => runCheckout("pix")}
                    />
                  ) : (
                    <CardCheckoutButton
                      key={p.storeId}
                      storeName={p.storeName}
                      amount={p.amount}
                      preferenceId={p.paymentId}
                      checkoutUrl={p.checkoutUrl}
                      status={p.status}
                    />
                  ),
                )}
              </div>
            )}
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-1 bg-background">
        <div className="max-w-2xl mx-auto px-4 py-10">
          <header className="mb-8">
            <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">Finalizar compra</h1>
          </header>

          {items.length === 0 ? (
            <div
              className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm py-16 px-6 text-center"
              style={{ borderRadius: "16px" }}
            >
              <ShoppingBag size={40} className="mx-auto mb-4 text-muted-foreground opacity-40" />
              <p className="font-display text-xl font-bold text-dark dark:text-[#f5edd6]">
                Seu carrinho está vazio
              </p>
              <Link
                href="/produtos"
                className="inline-block mt-5 bg-terracota hover:bg-terracota/90 text-white font-semibold text-sm px-6 py-2 rounded-full transition-colors"
              >
                Explorar produtos
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-5 mb-6">
                {groups.map((group) => (
                  <div
                    key={group.storeId}
                    className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm p-5"
                    style={{ borderRadius: "16px" }}
                  >
                    <div className="flex items-center gap-2 pb-3 mb-3 border-b border-border dark:border-[#3d2c1a]">
                      <Store size={16} className="text-terracota" />
                      <span className="font-semibold text-dark dark:text-[#f5edd6]">{group.storeName}</span>
                    </div>
                    <ul className="flex flex-col gap-3">
                      {group.items.map(({ product, quantity }) => {
                        const img = product.images?.[0]?.url ?? PLACEHOLDER_PRODUCT_IMG;
                        return (
                          <li key={product.id} className="flex items-center gap-3">
                            <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-cream dark:bg-[#3d2c1a] flex-shrink-0">
                              <Image src={img} alt={product.name} fill className="object-cover" sizes="48px" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-dark dark:text-[#f5edd6] truncate">{product.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {quantity} × {formatPrice(product.price)}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-dark dark:text-[#f5edd6]">
                              {formatPrice(product.price * quantity)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border dark:border-[#3d2c1a]">
                      <span className="text-sm text-muted-foreground">Subtotal</span>
                      <span className="font-bold text-terracota">{formatPrice(group.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm p-5"
                style={{ borderRadius: "16px" }}
              >
                <p className="font-semibold text-dark dark:text-[#f5edd6] mb-3">Forma de pagamento</p>
                <div className="flex gap-3 mb-5">
                  {(["pix", "credit_card"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`flex-1 border rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                        method === m
                          ? "border-terracota bg-terracota/10 text-terracota"
                          : "border-border dark:border-[#3d2c1a] text-dark dark:text-[#f5edd6] hover:border-terracota/40"
                      }`}
                    >
                      {m === "pix" ? "Pix" : "Cartão de crédito"}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-dark dark:text-[#f5edd6]">Total</span>
                  <span className="font-bold text-xl text-terracota">{formatPrice(total)}</span>
                </div>

                <button
                  onClick={() => runCheckout(method)}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-terracota hover:bg-terracota/90 disabled:opacity-60 text-white font-semibold h-11 rounded-full transition-colors"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  Finalizar compra
                </button>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutContent />
    </Suspense>
  );
}
