import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_CLASS } from "@/lib/constants";
import type { PaymentStatus } from "@/types";

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
        PAYMENT_STATUS_CLASS[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {PAYMENT_STATUS_LABEL[status] ?? status}
    </span>
  );
}
