"use client";

import { useEffect, useState, useCallback } from "react";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { checkPaymentStatus } from "@/actions/payments";
import { formatPrice } from "@/lib/utils";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import type { PaymentStatus } from "@/types";

interface PixPaymentProps {
  orderId: string;
  storeId: string;
  storeName: string;
  amount: number;
  qrCode: string | null | undefined;
  qrCodeBase64: string | null | undefined;
  expiresAt: string | null | undefined;
  status: PaymentStatus;
  onStatusChange: (status: PaymentStatus) => void;
  onRegenerate: () => void;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = String(Math.floor(total / 60)).padStart(2, "0");
  const sec = String(total % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

export function PixPayment({
  orderId,
  storeId,
  storeName,
  amount,
  qrCode,
  qrCodeBase64,
  expiresAt,
  status,
  onStatusChange,
  onRegenerate,
}: PixPaymentProps) {
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);

  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : null;
  const isExpired = expiresAtMs != null && now >= expiresAtMs;

  const verify = useCallback(async () => {
    setChecking(true);
    const result = await checkPaymentStatus(orderId, storeId);
    setChecking(false);
    if ("error" in result) return;
    if (result.status !== status) onStatusChange(result.status as PaymentStatus);
  }, [orderId, storeId, status, onStatusChange]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (status !== "pending" || isExpired) return;
    const poll = setInterval(verify, 4000);
    return () => clearInterval(poll);
  }, [status, isExpired, verify]);

  const copyCode = async () => {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode);
      toast.success("Código Pix copiado!");
    } catch {
      toast.error("Não foi possível copiar o código.");
    }
  };

  return (
    <div
      className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm p-5"
      style={{ borderRadius: "16px" }}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="font-semibold text-dark dark:text-[#f5edd6]">{storeName}</p>
          <p className="text-sm text-terracota font-bold">{formatPrice(amount)}</p>
        </div>
        <PaymentStatusBadge status={status} />
      </div>

      {status === "paid" ? (
        <p className="text-sm text-capim font-medium">Pagamento confirmado! 🎉</p>
      ) : isExpired ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive font-medium">Esse código Pix expirou.</p>
          <button
            onClick={onRegenerate}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-terracota hover:underline"
          >
            <RefreshCw size={14} /> Gerar novo código
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {qrCodeBase64 && (
            <img
              src={`data:image/png;base64,${qrCodeBase64}`}
              alt="QR Code Pix"
              className="w-44 h-44 rounded-lg border border-border dark:border-[#3d2c1a]"
            />
          )}

          {expiresAtMs != null && (
            <p className="text-xs text-muted-foreground">
              Expira em <span className="font-semibold text-dark dark:text-[#f5edd6]">{formatCountdown(expiresAtMs - now)}</span>
            </p>
          )}

          {qrCode && (
            <button
              onClick={copyCode}
              className="w-full flex items-center justify-center gap-2 border border-border dark:border-[#3d2c1a] rounded-lg py-2 text-sm font-medium text-dark dark:text-[#f5edd6] hover:border-terracota/40 transition-colors"
            >
              <Copy size={14} /> Copiar código Pix
            </button>
          )}

          <button
            onClick={verify}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-terracota hover:underline disabled:opacity-60"
          >
            {checking && <Loader2 size={14} className="animate-spin" />}
            Verificar pagamento
          </button>
        </div>
      )}
    </div>
  );
}
