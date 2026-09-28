"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ShoppingBag, Truck, Zap, Pencil, ShieldCheck, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { formatPrice, formatCPF, isValidCPF, formatCEP, onlyDigits } from "@/lib/utils";
import { BR_STATES } from "@/lib/br-states";
import { shippingAddressSchema, type ShippingAddressInput } from "@/lib/validations";
import { fetchAddressByCep } from "@/lib/viacep";
import { createOrder, type SelectedShippingInput } from "@/actions/orders";
import { calculateShippingForCart, type StoreShippingQuote } from "@/actions/shipping";
import { createPayment, getOrderPaymentStatus } from "@/actions/payments";
import { PixPayment } from "@/components/checkout/PixPayment";
import { CardCheckoutButton } from "@/components/checkout/CardCheckoutButton";
import { CheckoutStepper, type CheckoutStep } from "@/components/checkout/CheckoutStepper";
import { OrderSummary } from "@/components/checkout/OrderSummary";
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

// Contraste reforçado (WCAG AA, mínimo 4.5:1) — as cores anteriores (muted-foreground /
// border padrão) quase somem em cima dos cards escuros. Mantém a paleta, só ajusta os
// tons usados especificamente em rótulo, placeholder e borda de campo.
const labelClass = "text-xs font-medium text-[#5A4632] dark:text-[#D9C4A0]";
const fieldClass =
  "mt-1 w-full h-10 rounded-lg border border-[#8a6a4a] bg-transparent px-3 text-sm outline-none text-dark dark:text-[#f5edd6] placeholder:text-[#5A4632]/70 dark:placeholder:text-[#D9C4A0]/60 focus-visible:ring-2 focus-visible:ring-terracota focus-visible:border-terracota transition-colors";
const cardClass = "bg-white dark:bg-[#2a1e0f] border border-[#8a6a4a]/40 shadow-sm p-5";

/**
 * A Uber Direct devolve previsão de entrega como timestamp (entrega no mesmo
 * dia), não em dias como o Melhor Envio.
 */
function formatDeliveryEta(iso: string | null | undefined): string {
  if (!iso) return "entrega hoje";
  const eta = new Date(iso);
  if (Number.isNaN(eta.getTime())) return "entrega hoje";

  const hora = eta.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const isHoje = eta.toDateString() === new Date().toDateString();
  return isHoje ? `hoje às ${hora}` : `${eta.toLocaleDateString("pt-BR")} às ${hora}`;
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items, total, clear } = useCart();
  const { profile } = useAuth();

  const [address, setAddress] = useState<ShippingAddressInput>(EMPTY_ADDRESS);
  const [cepLoading, setCepLoading] = useState(false);
  const [quotes, setQuotes] = useState<StoreShippingQuote[] | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<Record<string, ShippingOption>>({});
  // Enquanto o CEP não resolve, rua/bairro/cidade/UF ficam escondidos. Depois de resolver,
  // aparecem só-leitura (com link "editar"); se o CEP não for encontrado, ou o usuário clicar
  // em editar, os campos viram editáveis pra digitação manual.
  const [manualAddress, setManualAddress] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

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

  // Pré-preenche nome e telefone do perfil logado, sem sobrescrever o que o usuário já digitou.
  // O setState roda depois de um microtask (Promise.resolve().then) pra não disparar
  // dentro do corpo do efeito, evitando o cascading render que o lint dos hooks reprova.
  useEffect(() => {
    if (!profile) return;
    Promise.resolve().then(() => {
      setAddress((a) => ({
        ...a,
        recipient_name: a.recipient_name || profile.full_name || "",
        recipient_phone: a.recipient_phone || profile.phone || "",
      }));
    });
  }, [profile]);

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

  /**
   * Recota o frete de todas as lojas. Cidade/UF decidem se a loja oferece
   * entrega expressa, e rua/número vão pra cotação da Uber Direct — por isso
   * manda o endereço inteiro, não só o CEP.
   */
  const runShippingQuote = async (destination: ShippingAddressInput) => {
    const shippingResult = await calculateShippingForCart(
      {
        cep: destination.cep,
        city: destination.address_city,
        state: destination.address_state,
        street: destination.address_street,
        number: destination.address_number,
        neighborhood: destination.address_neighborhood,
      },
      items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
    );

    if ("error" in shippingResult) {
      toast.error(shippingResult.error);
      return;
    }
    setQuotes(shippingResult.quotes);
    setSelectedShipping({});
  };

  const handleCepBlur = async (value: string) => {
    if (onlyDigits(value).length !== 8) return;

    setCepLoading(true);
    const found = await fetchAddressByCep(value);

    // O endereço preenchido pelo ViaCEP só cai no state depois do render; a
    // cotação precisa dele agora (cidade/UF definem se tem entrega expressa),
    // daí montar o destino aqui em vez de ler `address`.
    const destination: ShippingAddressInput = {
      ...address,
      cep: value,
      address_street: found?.street || address.address_street,
      address_neighborhood: found?.neighborhood || address.address_neighborhood,
      address_city: found?.city || address.address_city,
      address_state: found?.state || address.address_state,
    };

    if (found) {
      setAddress(destination);
      setManualAddress(false);
    } else {
      toast.error("CEP não encontrado. Preencha o endereço manualmente.");
      setManualAddress(true);
    }

    await runShippingQuote(destination);
    setCepLoading(false);
  };

  /**
   * O número da casa costuma ser digitado DEPOIS do CEP, e a Uber Direct cota
   * por endereço completo — sem recotar aqui, a entrega expressa ficaria com o
   * preço de um endereço sem número (ou nem apareceria).
   */
  const handleNumberBlur = async () => {
    if (!quotes || onlyDigits(address.cep).length !== 8 || !address.address_number) return;
    setCepLoading(true);
    await runShippingQuote(address);
    setCepLoading(false);
  };

  const shippingTotal = Object.values(selectedShipping).reduce((sum, o) => sum + o.price, 0);
  const grandTotal = total + shippingTotal;

  const addressValid = shippingAddressSchema.safeParse(address).success;
  const shippingSelectedForAll = !!quotes && groups.every((g) => !!selectedShipping[g.storeId]);
  const currentStep: CheckoutStep = !addressValid ? "endereco" : !shippingSelectedForAll ? "entrega" : "pagamento";
  const payDisabledReason = !addressValid
    ? "Preencha o endereço de entrega para continuar"
    : !quotes
      ? "Aguardando o cálculo do frete"
      : !shippingSelectedForAll
        ? "Selecione uma opção de frete para todas as lojas do carrinho"
        : null;
  const addressResolved = manualAddress ? false : !!address.address_city;

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
        carrier: o.carrier,
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
        <div className="max-w-6xl mx-auto px-4 py-10 pb-28 lg:pb-10">
          <header className="mb-6">
            <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">Finalizar compra</h1>
          </header>

          {items.length === 0 ? (
            <div
              className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm py-16 px-6 text-center max-w-2xl mx-auto"
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
            <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
              <div className="min-w-0">
                <CheckoutStepper current={currentStep} />

                {/* Resumo colapsável — só no mobile, onde não há coluna lateral fixa. */}
                <button
                  type="button"
                  onClick={() => setSummaryOpen((v) => !v)}
                  className="lg:hidden w-full flex items-center justify-between gap-3 bg-white dark:bg-[#2a1e0f] border border-[#8a6a4a]/40 shadow-sm px-4 py-3 mb-5 rounded-2xl"
                >
                  <span className="text-sm font-medium text-dark dark:text-[#f5edd6]">
                    Ver resumo do pedido
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-terracota">{formatPrice(grandTotal)}</span>
                    <ChevronDown
                      size={16}
                      className={`text-[#5A4632] dark:text-[#D9C4A0] transition-transform ${summaryOpen ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>
                {summaryOpen && (
                  <div className="lg:hidden mb-5">
                    <OrderSummary
                      groups={groups}
                      quotes={quotes}
                      selectedShipping={selectedShipping}
                      total={total}
                      shippingTotal={shippingTotal}
                      grandTotal={grandTotal}
                    />
                  </div>
                )}

                {/* Endereço de entrega */}
                <div className={`${cardClass} mb-6`} style={{ borderRadius: "16px" }}>
                  <p className="font-semibold text-dark dark:text-[#f5edd6] mb-3">Endereço de entrega</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelClass}>Nome do destinatário</label>
                      <input
                        value={address.recipient_name}
                        onChange={(e) => setAddress((a) => ({ ...a, recipient_name: e.target.value }))}
                        className={fieldClass}
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelClass}>Telefone</label>
                      <input
                        value={address.recipient_phone}
                        onChange={(e) => setAddress((a) => ({ ...a, recipient_phone: e.target.value }))}
                        placeholder="(00) 00000-0000"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>CEP</label>
                      <div className="relative">
                        <input
                          value={address.cep}
                          onChange={(e) => setAddress((a) => ({ ...a, cep: formatCEP(e.target.value) }))}
                          onBlur={(e) => handleCepBlur(e.target.value)}
                          placeholder="00000-000"
                          className={fieldClass}
                        />
                        {cepLoading && (
                          <Loader2 size={14} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-terracota" />
                        )}
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Número</label>
                      <input
                        value={address.address_number}
                        onChange={(e) => setAddress((a) => ({ ...a, address_number: e.target.value }))}
                        onBlur={handleNumberBlur}
                        className={fieldClass}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={labelClass}>Complemento (opcional)</label>
                      <input
                        value={address.address_complement}
                        onChange={(e) => setAddress((a) => ({ ...a, address_complement: e.target.value }))}
                        className={fieldClass}
                      />
                    </div>

                    {addressResolved && (
                      <div className="col-span-2 rounded-lg border border-[#8a6a4a]/50 bg-cream/50 dark:bg-[#1f160b] px-3 py-2.5 flex items-start justify-between gap-3">
                        <div className="text-sm text-dark dark:text-[#f5edd6] min-w-0">
                          <p className="truncate">{address.address_street}</p>
                          <p className="text-xs text-[#5A4632] dark:text-[#D9C4A0]">
                            {address.address_neighborhood} — {address.address_city}/{address.address_state}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setManualAddress(true)}
                          className="text-xs font-medium text-terracota hover:underline whitespace-nowrap flex items-center gap-1 shrink-0"
                        >
                          <Pencil size={12} /> editar
                        </button>
                      </div>
                    )}

                    {manualAddress && (
                      <>
                        <div className="col-span-2">
                          <label className={labelClass}>Rua</label>
                          <input
                            value={address.address_street}
                            onChange={(e) => setAddress((a) => ({ ...a, address_street: e.target.value }))}
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Bairro</label>
                          <input
                            value={address.address_neighborhood}
                            onChange={(e) => setAddress((a) => ({ ...a, address_neighborhood: e.target.value }))}
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Cidade</label>
                          <input
                            value={address.address_city}
                            onChange={(e) => setAddress((a) => ({ ...a, address_city: e.target.value }))}
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Estado</label>
                          <select
                            value={address.address_state}
                            onChange={(e) => setAddress((a) => ({ ...a, address_state: e.target.value }))}
                            className={fieldClass}
                          >
                            <option value="">Selecione</option>
                            {BR_STATES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Entrega */}
                <div className={`${cardClass} mb-6`} style={{ borderRadius: "16px" }}>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Truck size={16} className="text-terracota" />
                    <p className="font-semibold text-dark dark:text-[#f5edd6]">Entrega</p>
                  </div>

                  {!quotes && !cepLoading && (
                    <p className="text-sm text-[#5A4632] dark:text-[#D9C4A0]">
                      Frete: calculado após o CEP
                    </p>
                  )}

                  {cepLoading && (
                    <div className="flex flex-col gap-2" role="status" aria-live="polite">
                      <p className="text-sm text-[#5A4632] dark:text-[#D9C4A0] mb-1">
                        Calculando opções de entrega…
                      </p>
                      {[0, 1].map((i) => (
                        <div key={i} className="h-11 rounded-lg bg-cream/60 dark:bg-[#3d2c1a] animate-pulse" />
                      ))}
                    </div>
                  )}

                  {!cepLoading && quotes && (
                    <div className="flex flex-col gap-4">
                      {quotes.map((q) => (
                        <div key={q.storeId}>
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-dark dark:text-[#f5edd6] mb-2">
                            {q.storeName}
                          </div>
                          {q.options.length === 0 ? (
                            <p className="text-xs text-destructive">
                              {q.error ?? "Nenhuma opção de frete disponível pra esse CEP."}
                            </p>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {q.options.map((opt) => {
                                const selected = selectedShipping[q.storeId];
                                const isSelected =
                                  selected?.carrier === opt.carrier && selected?.serviceId === opt.serviceId;
                                return (
                                  <label
                                    key={`${opt.carrier}-${opt.serviceId}`}
                                    className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                                      isSelected
                                        ? "border-terracota bg-terracota/10"
                                        : "border-[#8a6a4a]/50 hover:border-terracota/60"
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      <input
                                        type="radio"
                                        name={`shipping-${q.storeId}`}
                                        checked={isSelected}
                                        onChange={() => setSelectedShipping((s) => ({ ...s, [q.storeId]: opt }))}
                                        className="accent-terracota"
                                      />
                                      <span className="text-dark dark:text-[#f5edd6]">
                                        {opt.carrier === "uber_direct" ? (
                                          <>
                                            <Zap size={12} className="inline mb-0.5 text-terracota" /> {opt.serviceName} (
                                            {opt.companyName}) · {formatDeliveryEta(opt.deliveryEtaISO)}
                                          </>
                                        ) : (
                                          <>
                                            {opt.serviceName} {opt.companyName ? `(${opt.companyName})` : ""} ·{" "}
                                            {opt.deliveryTimeDays} dia(s)
                                          </>
                                        )}
                                      </span>
                                    </span>
                                    <span className="font-semibold text-terracota whitespace-nowrap">{formatPrice(opt.price)}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          {/* Falha do Melhor Envio quando a entrega expressa cotou: vira aviso, não bloqueio. */}
                          {q.error && q.options.length > 0 && (
                            <p className="text-xs text-[#5A4632] dark:text-[#D9C4A0] mt-1.5">{q.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pagamento */}
                <div className={cardClass} style={{ borderRadius: "16px" }}>
                  <p className="font-semibold text-dark dark:text-[#f5edd6] mb-3">Forma de pagamento</p>
                  <div className="flex gap-3 mb-5">
                    {(["pix", "credit_card"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMethod(m)}
                        className={`flex-1 border rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                          method === m
                            ? "border-terracota bg-terracota/10 text-terracota"
                            : "border-[#8a6a4a]/50 text-dark dark:text-[#f5edd6] hover:border-terracota/60"
                        }`}
                      >
                        {m === "pix" ? "Pix" : "Cartão de crédito"}
                      </button>
                    ))}
                  </div>

                  {method === "pix" && (
                    <div className="mb-5">
                      <label htmlFor="cpf" className={labelClass}>
                        CPF do comprador
                      </label>
                      <input
                        id="cpf"
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                        value={cpf}
                        onChange={(e) => setCpf(formatCPF(e.target.value))}
                        className={fieldClass}
                      />
                      <p className="text-xs text-[#5A4632] dark:text-[#D9C4A0] mt-1">
                        Exigido pela Mercado Pago pra pagamentos via Pix.
                      </p>
                    </div>
                  )}

                  {formError && <p className="text-xs text-destructive mb-3">{formError}</p>}
                  {!formError && payDisabledReason && (
                    <p className="text-xs text-[#5A4632] dark:text-[#D9C4A0] mb-3">{payDisabledReason}</p>
                  )}

                  <button
                    onClick={() => runCheckout(method)}
                    disabled={submitting || !!payDisabledReason}
                    className="hidden lg:flex w-full items-center justify-center gap-2 bg-terracota hover:bg-terracota/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold h-11 rounded-full transition-colors"
                  >
                    {submitting && <Loader2 size={16} className="animate-spin" />}
                    Finalizar compra
                  </button>
                  <p className="hidden lg:flex items-center justify-center gap-1.5 text-xs text-[#5A4632] dark:text-[#D9C4A0] mt-3">
                    <ShieldCheck size={13} className="text-terracota" /> Pagamento seguro via Mercado Pago
                  </p>
                </div>
              </div>

              {/* Resumo fixo — desktop */}
              <div className="hidden lg:block lg:sticky lg:top-20">
                <OrderSummary
                  groups={groups}
                  quotes={quotes}
                  selectedShipping={selectedShipping}
                  total={total}
                  shippingTotal={shippingTotal}
                  grandTotal={grandTotal}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Barra fixa — mobile */}
      {items.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-[#2a1e0f] border-t border-[#8a6a4a]/40 shadow-lg px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#5A4632] dark:text-[#D9C4A0]">Total</p>
            <p className="font-bold text-terracota truncate">{formatPrice(grandTotal)}</p>
            {payDisabledReason && !formError && (
              <p className="text-[11px] text-[#5A4632] dark:text-[#D9C4A0] truncate">{payDisabledReason}</p>
            )}
          </div>
          <button
            onClick={() => runCheckout(method)}
            disabled={submitting || !!payDisabledReason}
            className="flex items-center justify-center gap-2 bg-terracota hover:bg-terracota/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold h-11 px-6 rounded-full transition-colors shrink-0"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Pagar
          </button>
        </div>
      )}

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
