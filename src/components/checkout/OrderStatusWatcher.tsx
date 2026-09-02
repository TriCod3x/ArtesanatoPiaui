"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { checkPaymentStatus } from "@/actions/payments";

/**
 * Revalida o status do pedido sempre que a aba volta ao foco (spec: "revalidação
 * ao focar a aba"). Enquanto o pagamento estiver pendente, consulta a Pagar.me;
 * caso contrário só faz `router.refresh()`.
 */
export function OrderStatusWatcher({
  orderId,
  active,
}: {
  orderId: string;
  active: boolean;
}) {
  const router = useRouter();
  const busy = useRef(false);

  useEffect(() => {
    const onFocus = async () => {
      if (document.visibilityState === "hidden" || busy.current) return;
      busy.current = true;
      try {
        if (active) {
          await checkPaymentStatus(orderId);
        }
        router.refresh();
      } finally {
        busy.current = false;
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [orderId, active, router]);

  return null;
}
