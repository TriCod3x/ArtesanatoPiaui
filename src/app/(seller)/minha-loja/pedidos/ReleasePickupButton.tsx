"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PackageCheck } from "lucide-react";
import { releaseExpressPickup } from "@/actions/express-pickup";
import { Button } from "@/components/ui/button";

export function ReleasePickupButton({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (sending) return;
    setSending(true);
    setError(null);

    try {
      const result = await releaseExpressPickup(shipmentId);
      if ("error" in result) {
        setError(result.error);
        toast.error(result.error);
      } else if (result.fallbackToMelhorEnvio) {
        toast.success("A entrega expressa não estava disponível; o envio foi trocado para Correios.");
      } else if (result.alreadyReleased) {
        toast.info("A retirada deste pedido já tinha sido liberada.");
      } else {
        toast.success("Retirada liberada! O motorista foi chamado.");
      }
      router.refresh();
    } catch {
      const message = "Não foi possível liberar a retirada agora. Tente novamente.";
      setError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        onClick={handleClick}
        disabled={sending}
        className="bg-terracota hover:bg-terracota/90 text-white font-semibold gap-1.5"
      >
        {sending ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
        {sending ? "Chamando motorista..." : "Pronto pra retirada"}
      </Button>
      {error && <p className="text-xs text-destructive max-w-xs text-right">{error}</p>}
    </div>
  );
}
