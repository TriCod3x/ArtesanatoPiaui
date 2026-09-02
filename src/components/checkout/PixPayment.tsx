"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { checkPaymentStatus } from "@/actions/payments";
import type { PaymentStatus } from "@/types";

interface Props {
  orderId: string;
  qrCode: string | null;
  qrCodeUrl: string | null;
  expiresAt: string | null;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "expirado";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PixPayment({ orderId, qrCode, qrCodeUrl, expiresAt }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => setRemaining(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const copy = async () => {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const verify = useCallback(async () => {
    setChecking(true);
    const res = await checkPaymentStatus(orderId);
    setChecking(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }
    const status = res.status as PaymentStatus | undefined;
    if (status === "paid") {
      toast.success("Pagamento confirmado!");
      router.refresh();
    } else if (status === "failed") {
      toast.error("O pagamento falhou. Tente novamente.");
      router.refresh();
    } else {
      toast.info("Ainda não identificamos o pagamento. Tente novamente em instantes.");
    }
  }, [orderId, router]);

  return (
    <div className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-6 text-center">
      <p className="font-display text-lg font-bold text-dark dark:text-[#f5edd6] mb-1">
        Pague com Pix para confirmar o pedido
      </p>
      {remaining !== null && (
        <p className="text-sm text-muted-foreground mb-4">
          Este código expira em{" "}
          <span className="font-semibold text-terracota">
            {formatCountdown(remaining)}
          </span>
        </p>
      )}

      {qrCodeUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrCodeUrl}
          alt="QR Code Pix"
          width={220}
          height={220}
          className="mx-auto rounded-xl border border-border dark:border-[#3d2c1a] bg-white p-2"
        />
      ) : (
        <p className="text-sm text-muted-foreground py-8">
          QR Code indisponível — use o código copia-e-cola abaixo.
        </p>
      )}

      {qrCode && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-1.5">Pix copia e cola</p>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 min-w-0 truncate text-xs bg-cream dark:bg-[#1a1208] rounded-lg px-3 py-2.5 text-left text-dark dark:text-[#f5edd6]">
              {qrCode}
            </code>
            <Button
              type="button"
              onClick={copy}
              variant="outline"
              className="shrink-0 gap-1.5 dark:border-[#3d2c1a] dark:text-[#f5edd6]"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}

      <Button
        type="button"
        onClick={verify}
        disabled={checking}
        className="w-full mt-5 bg-terracota hover:bg-terracota/90 text-white font-semibold h-11 gap-2"
      >
        {checking ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={15} />}
        Já paguei — verificar status
      </Button>
    </div>
  );
}
