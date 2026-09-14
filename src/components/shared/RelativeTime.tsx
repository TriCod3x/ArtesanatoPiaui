"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/utils";

interface RelativeTimeProps {
  /** Data em ISO string (ou Date). */
  date: string | Date;
  className?: string;
}

/**
 * Exibe "há X minutos" etc., mas de forma segura para hidratação.
 *
 * `timeAgo` depende de `Date.now()`, então calcular no render causa divergência
 * entre o HTML do servidor e o primeiro render do cliente (React error #418).
 * Aqui o SSR e o primeiro render do cliente mostram sempre a data absoluta
 * (determinística — locale e timezone fixos), e só depois de montar trocamos
 * para o tempo relativo, atualizando a cada minuto.
 */
function absoluteLabel(date: string | Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Fortaleza",
  });
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const iso = typeof date === "string" ? date : date.toISOString();
  const [label, setLabel] = useState(() => absoluteLabel(iso));

  useEffect(() => {
    const update = () => setLabel(timeAgo(iso));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [iso]);

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {label}
    </time>
  );
}
