"use client";

import { useState } from "react";
import Script from "next/script";
import { CreditCard, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import type { PaymentStatus } from "@/types";

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string) => {
      checkout: (options: { preference: { id: string }; autoOpen?: boolean }) => void;
    };
  }
}

interface CardCheckoutButtonProps {
  storeName: string;
  amount: number;
  preferenceId: string | null | undefined;
  checkoutUrl: string | null | undefined;
  status: PaymentStatus;
}

export function CardCheckoutButton({ storeName, amount, preferenceId, checkoutUrl, status }: CardCheckoutButtonProps) {
  const [sdkReady, setSdkReady] = useState(false);

  const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;

  const handlePay = () => {
    if (!preferenceId) return;
    if (publicKey && sdkReady && window.MercadoPago) {
      const mp = new window.MercadoPago(publicKey);
      mp.checkout({ preference: { id: preferenceId }, autoOpen: true });
      return;
    }
    // Sem SDK carregado (ou sem chave pública configurada), redireciona direto.
    if (checkoutUrl) window.location.href = checkoutUrl;
  };

  return (
    <div
      className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm p-5"
      style={{ borderRadius: "16px" }}
    >
      <Script src="https://sdk.mercadopago.com/js/v2" onReady={() => setSdkReady(true)} />

      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="font-semibold text-dark dark:text-[#f5edd6]">{storeName}</p>
          <p className="text-sm text-terracota font-bold">{formatPrice(amount)}</p>
        </div>
        <PaymentStatusBadge status={status} />
      </div>

      {status === "paid" ? (
        <p className="text-sm text-capim font-medium">Pagamento confirmado! 🎉</p>
      ) : (
        <button
          onClick={handlePay}
          disabled={!preferenceId}
          className="w-full flex items-center justify-center gap-2 bg-terracota hover:bg-terracota/90 disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-full transition-colors"
        >
          {preferenceId ? <CreditCard size={16} /> : <Loader2 size={16} className="animate-spin" />}
          Pagar com cartão
        </button>
      )}
    </div>
  );
}
