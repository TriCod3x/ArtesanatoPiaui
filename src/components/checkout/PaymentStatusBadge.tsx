import { cn } from "@/lib/utils";

interface Props {
  orderStatus: string;
  paymentStatus: string | null;
  className?: string;
}

const LABELS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Pago", cls: "bg-capim/15 text-capim border-capim/30" },
  confirmed: { label: "Pagamento confirmado", cls: "bg-capim/15 text-capim border-capim/30" },
  shipped: { label: "Enviado", cls: "bg-capim/15 text-capim border-capim/30" },
  delivered: { label: "Entregue", cls: "bg-capim/15 text-capim border-capim/30" },
  pending: { label: "Aguardando pagamento", cls: "bg-amber/15 text-amber border-amber/30" },
  failed: { label: "Pagamento recusado", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
  refunded: { label: "Estornado", cls: "bg-muted text-muted-foreground border-border" },
};

/** Deriva um rótulo único a partir do status do pedido + do pagamento. */
export function PaymentStatusBadge({ orderStatus, paymentStatus, className }: Props) {
  let key = orderStatus;
  if (orderStatus === "pending") {
    key = paymentStatus === "failed" ? "failed" : "pending";
  } else if (orderStatus === "confirmed" && paymentStatus === "paid") {
    key = "confirmed";
  }
  const entry = LABELS[key] ?? LABELS.pending;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap",
        entry.cls,
        className,
      )}
    >
      {entry.label}
    </span>
  );
}
