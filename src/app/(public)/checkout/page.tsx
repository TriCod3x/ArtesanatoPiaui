"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Store, ShoppingBag, Truck } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useCart } from "@/hooks/useCart";
import { formatPrice, formatCPF, isValidCPF, formatCEP, onlyDigits } from "@/lib/utils";
import { PLACEHOLDER_PRODUCT_IMG } from "@/lib/constants";
import { shippingAddressSchema, type ShippingAddressInput } from "@/lib/validations";
import { fetchAddressByCep } from "@/lib/viacep";
import { createOrder, type SelectedShippingInput } from "@/actions/orders";
import { calculateShippingForCart, type StoreShippingQuote } from "@/actions/shipping";
import { createPayment, getOrderPaymentStatus } from "@/actions/payments";
import { PixPayment } from "@/components/checkout/PixPayment";
import { CardCheckoutButton } from "@/components/checkout/CardCheckoutButton";
import type { PaymentMethod, PaymentStatus, ShippingOption, StorePaymentResult } from "@/types";

const EMPTY_ADDRESS: ShippingAddressInput = {
  recipient_name: "",
  recipient_phone: "",
  cep: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_neighborhood: "",
  address_city: "",
  address_state: "",
};

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items, total, clear } = useCart();

  const [address, setAddress] = useState<ShippingAddressInput>(EMPTY_ADDRESS);
  const [cepLoading, setCepLoading] = useState(false);
  const [quotes, setQuotes] = useState<StoreShippingQuote[] | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<Record<string, ShippingOption>>({});

  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [cpf, setCpf] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
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

  const handleCepBlur = async (value: string) => {
    if (onlyDigits(value).length !== 8) return;

    setCepLoading(true);
    const found = await fetchAddressByCep(value);
    if (found) {
      setAddress((a) => ({
        ...a,
        address_street: found.street || a.address_street,
        address_neighborhood: found.neighborhood || a.address_neighborhood,
        address_city: found.city || a.address_city,
        address_state: found.state || a.address_state,
      }));
    } else {
      toast.error("CEP não encontrado. Preencha o endereço manualmente.");
    }

    const shippingResult = await calculateShippingForCart(
      value,
      items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
    );
    setCepLoading(false);

    if ("error" in shippingResult) {
      toast.error(shippingResult.error);
      return;
    }
    setQuotes(shippingResult.quotes);
    setSelectedShipping({});
  };

  const shippingTotal = Object.values(selectedShipping).reduce((sum, o) => sum + o.price, 0);
  const grandTotal = total + shippingTotal;

  const runCheckout = async (selectedMethod: PaymentMethod) => {
    const addressParsed = shippingAddressSchema.safeParse(address);
    if (!addressParsed.success) {
      setFormError(addressParsed.error.issues[0]?.message ?? "Preencha o endereço de entrega.");
      return;
    }
    if (!quotes || groups.some((g) => !selectedShipping[g.storeId])) {
      setFormError("Selecione uma opção de frete para todas as lojas do carrinho.");
      return;
    }
    if (selectedMethod === "pix" && !isValidCPF(cpf)) {
      setFormError("Informe um CPF válido para pagar com Pix.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    setMethod(selectedMethod);

    let currentOrderId = orderId;
    if (!currentOrderId) {
      const selected: SelectedShippingInput[] = Object.values(selectedShipping).map((o) => ({
        storeId: o.storeId,
        serviceId: o.serviceId,
        serviceName: o.serviceName,
        price: o.price,
        deliveryTimeDays: o.deliveryTimeDays,
      }));

      const orderResult = await createOrder(
        items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        address,
        selected,
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

    const paymentResult = await createPayment(
      currentOrderId,
      selectedMethod,
      selectedMethod === "pix" ? cpf : undefined,
    );
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

              {/* Endereço de entrega */}
              <div
                className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm p-5 mb-6"
                style={{ borderRadius: "16px" }}
              >
                <p className="font-semibold text-dark dark:text-[#f5edd6] mb-3">Endereço de entrega</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-xs text-muted-foreground">Nome do destinatário</label>
                    <input
                      value={address.recipient_name}
                      onChange={(e) => setAddress((a) => ({ ...a, recipient_name: e.target.value }))}
                      className="mt-1 w-full h-10 rounded-lg border border-border dark:border-[#3d2c1a] bg-transparent px-3 text-sm outline-none text-dark dark:text-[#f5edd6] focus-visible:ring-3 focus-visible:ring-terracota/30"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-xs text-muted-foreground">Telefone</label>
                    <input
                      value={address.recipient_phone}
                      onChange={(e) => setAddress((a) => ({ ...a, recipient_phone: e.target.value }))}
                      placeholder="(00) 00000-0000"
                      className="mt-1 w-full h-10 rounded-lg border border-border dark:border-[#3d2c1a] bg-transparent px-3 text-sm outline-none text-dark dark:text-[#f5edd6] focus-visible:ring-3 focus-visible:ring-terracota/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">CEP</label>
                    <div className="relative">
                      <input
                        value={address.cep}
                        onChange={(e) => setAddress((a) => ({ ...a, cep: formatCEP(e.target.value) }))}
                        onBlur={(e) => handleCepBlur(e.target.value)}
                        placeholder="00000-000"
                        className="mt-1 w-full h-10 rounded-lg border border-border dark:border-[#3d2c1a] bg-transparent px-3 text-sm outline-none text-dark dark:text-[#f5edd6] focus-visible:ring-3 focus-visible:ring-terracota/30"
                      />
                      {cepLoading && (
                        <Loader2 size={14} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Número</label>
                    <input
                      value={address.address_number}
                      onChange={(e) => setAddress((a) => ({ ...a, address_number: e.target.value }))}
                      className="mt-1 w-full h-10 rounded-lg border border-border dark:border-[#3d2c1a] bg-transparent px-3 text-sm outline-none text-dark dark:text-[#f5edd6] focus-visible:ring-3 focus-visible:ring-terracota/30"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">Rua</label>
                    <input
                      value={address.address_street}
                      onChange={(e) => setAddress((a) => ({ ...a, address_street: e.target.value }))}
                      className="mt-1 w-full h-10 rounded-lg border border-border dark:border-[#3d2c1a] bg-transparent px-3 text-sm outline-none text-dark dark:text-[#f5edd6] focus-visible:ring-3 focus-visible:ring-terracota/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Complemento</label>
                    <input
                      value={address.address_complement}
                      onChange={(e) => setAddress((a) => ({ ...a, address_complement: e.target.value }))}
                      className="mt-1 w-full h-10 rounded-lg border border-border dark:border-[#3d2c1a] bg-transparent px-3 text-sm outline-none text-dark dark:text-[#f5edd6] focus-visible:ring-3 focus-visible:ring-terracota/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Bairro</label>
                    <input
                      value={address.address_neighborhood}
                      onChange={(e) => setAddress((a) => ({ ...a, address_neighborhood: e.target.value }))}
                      className="mt-1 w-full h-10 rounded-lg border border-border dark:border-[#3d2c1a] bg-transparent px-3 text-sm outline-none text-dark dark:text-[#f5edd6] focus-visible:ring-3 focus-visible:ring-terracota/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Cidade</label>
                    <input
                      value={address.address_city}
                      onChange={(e) => setAddress((a) => ({ ...a, address_city: e.target.value }))}
                      className="mt-1 w-full h-10 rounded-lg border border-border dark:border-[#3d2c1a] bg-transparent px-3 text-sm outline-none text-dark dark:text-[#f5edd6] focus-visible:ring-3 focus-visible:ring-terracota/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">UF</label>
                    <input
                      value={address.address_state}
                      maxLength={2}
                      onChange={(e) => setAddress((a) => ({ ...a, address_state: e.target.value.toUpperCase() }))}
                      className="mt-1 w-full h-10 rounded-lg border border-border dark:border-[#3d2c1a] bg-transparent px-3 text-sm uppercase outline-none text-dark dark:text-[#f5edd6] focus-visible:ring-3 focus-visible:ring-terracota/30"
                    />
                  </div>
                </div>

                {quotes && (
                  <div className="flex flex-col gap-4 mt-4 pt-4 border-t border-border dark:border-[#3d2c1a]">
                    {quotes.map((q) => (
                      <div key={q.storeId}>
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-dark dark:text-[#f5edd6] mb-2">
                          <Truck size={14} className="text-terracota" /> Frete — {q.storeName}
                        </div>
                        {q.error ? (
                          <p className="text-xs text-destructive">{q.error}</p>
                        ) : q.options.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nenhuma opção de frete disponível pra esse CEP.</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {q.options.map((opt) => (
                              <label
                                key={opt.serviceId}
                                className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                                  selectedShipping[q.storeId]?.serviceId === opt.serviceId
                                    ? "border-terracota bg-terracota/10"
                                    : "border-border dark:border-[#3d2c1a] hover:border-terracota/40"
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`shipping-${q.storeId}`}
                                    checked={selectedShipping[q.storeId]?.serviceId === opt.serviceId}
                                    onChange={() => setSelectedShipping((s) => ({ ...s, [q.storeId]: opt }))}
                                    className="accent-terracota"
                                  />
                                  <span className="text-dark dark:text-[#f5edd6]">
                                    {opt.serviceName} {opt.companyName ? `(${opt.companyName})` : ""} · {opt.deliveryTimeDays} dia(s)
                                  </span>
                                </span>
                                <span className="font-semibold text-terracota whitespace-nowrap">{formatPrice(opt.price)}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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

                {method === "pix" && (
                  <div className="mb-5">
                    <label htmlFor="cpf" className="text-sm font-medium text-dark dark:text-[#f5edd6]">
                      CPF do comprador
                    </label>
                    <input
                      id="cpf"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={(e) => setCpf(formatCPF(e.target.value))}
                      className="mt-1.5 w-full h-10 rounded-lg border border-border dark:border-[#3d2c1a] bg-transparent px-3 text-sm outline-none text-dark dark:text-[#f5edd6] focus-visible:ring-3 focus-visible:ring-terracota/30"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Exigido pela Mercado Pago pra pagamentos via Pix.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm text-muted-foreground mb-1">
                  <span>Produtos</span>
                  <span>{formatPrice(total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                  <span>Frete</span>
                  <span>{shippingTotal > 0 ? formatPrice(shippingTotal) : "—"}</span>
                </div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-dark dark:text-[#f5edd6]">Total</span>
                  <span className="font-bold text-xl text-terracota">{formatPrice(grandTotal)}</span>
                </div>

                {formError && <p className="text-xs text-destructive mb-3">{formError}</p>}

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
