"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 600;
/** Sem Realtime (conexão caída), atualiza a lista de 30 em 30 s. */
const FALLBACK_POLL_MS = 30_000;

/**
 * Mantém a lista de conversas (última mensagem, não lidas) em dia: qualquer
 * mensagem nova ou lida que a RLS deixa o usuário ver dispara um refresh do
 * servidor. Não renderiza nada.
 */
export function ConversationsRealtime() {
  const router = useRouter();
  const connectedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    const channel = supabase
      .channel("chat:list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, scheduleRefresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, scheduleRefresh)
      .subscribe((status) => {
        connectedRef.current = status === "SUBSCRIBED";
      });

    const poll = setInterval(() => {
      if (!connectedRef.current) router.refresh();
    }, FALLBACK_POLL_MS);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
