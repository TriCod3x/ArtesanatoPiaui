"use client";

import { useEffect, useMemo, useState } from "react";
import { getStoresWithoutPayments } from "@/actions/store-payments";

/**
 * IDs das lojas (entre as informadas) sem Mercado Pago conectado. Só informa a
 * UI — o bloqueio real é no createOrder. Enquanto carrega, ou se a consulta
 * falhar, devolve vazio (não bloqueia o comprador por uma falha de rede).
 */
export function useStoresWithoutPayments(storeIds: string[]): Set<string> {
  const key = useMemo(() => [...new Set(storeIds)].sort().join(","), [storeIds]);
  const [result, setResult] = useState<{ key: string; blocked: string[] }>({ key: "", blocked: [] });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getStoresWithoutPayments(key.split(",")).then((res) => {
      if (cancelled || "error" in res) return;
      setResult({ key, blocked: res.storeIds });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Resultado de uma composição antiga de carrinho não vale pra a atual.
  return useMemo(() => new Set(result.key === key ? result.blocked : []), [result, key]);
}
