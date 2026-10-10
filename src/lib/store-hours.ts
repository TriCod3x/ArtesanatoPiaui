import {
  EXPRESS_PICKUP_BUFFER_MINUTES,
  EXPRESS_PREP_MINUTES_OPTIONS,
  STORE_TIMEZONE,
} from "./constants";

/**
 * Horário de funcionamento da loja (tabela store_hours) e a regra de "a
 * entrega expressa pode ser oferecida agora?".
 *
 * Tudo aqui é puro (sem I/O) pra rodar igual no cliente, no servidor e nos
 * testes. Imports relativos de propósito: os testes compilam este arquivo
 * com tsc direto, sem o alias "@/".
 */

/** Linha de store_hours. `opens`/`closes` vêm do Postgres como "HH:MM:SS". */
export interface StoreHoursRow {
  weekday: number; // 0=domingo .. 6=sábado
  opens: string;
  closes: string;
}

export type ExpressUnavailableReason = "pausada" | "sem horário" | "fechada" | "fecha em breve";

export type ExpressAvailability =
  | { available: true }
  | {
      available: false;
      reason: ExpressUnavailableReason;
      /** Intervalo de hoje em "HH:MM", ou null se a loja não abre hoje. */
      today: { opens: string; closes: string } | null;
    };

const WEEKDAY_BY_SHORT: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TIMEZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Dia da semana e segundos desde 00:00 em Fortaleza para o instante `now`. */
export function getStoreLocalTime(now: Date): { weekday: number; secondsOfDay: number } {
  const parts = timeFormatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = WEEKDAY_BY_SHORT[get("weekday")];
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  return { weekday, secondsOfDay: hour * 3600 + minute * 60 + second };
}

/** "HH:MM" ou "HH:MM:SS" → minutos desde 00:00. Null se inválido. */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** "08:00:00" → "08:00". */
export function formatHHMM(value: string): string {
  return value.trim().slice(0, 5);
}

export function isExpressAvailableNow(params: {
  hours: StoreHoursRow[];
  paused: boolean;
  prepMinutes: number;
  now: Date;
}): ExpressAvailability {
  const { hours, paused, prepMinutes, now } = params;
  const { weekday, secondsOfDay } = getStoreLocalTime(now);

  const row = hours.find((h) => h.weekday === weekday);
  const today = row ? { opens: formatHHMM(row.opens), closes: formatHHMM(row.closes) } : null;

  if (paused) return { available: false, reason: "pausada", today };
  if (hours.length === 0) return { available: false, reason: "sem horário", today: null };
  if (!row) return { available: false, reason: "fechada", today: null };

  const opens = parseTimeToMinutes(row.opens);
  const closes = parseTimeToMinutes(row.closes);
  if (opens === null || closes === null) {
    // Dado corrompido: padrão seguro é não oferecer.
    return { available: false, reason: "sem horário", today: null };
  }

  const opensSec = opens * 60;
  const closesSec = closes * 60;
  if (secondsOfDay < opensSec || secondsOfDay >= closesSec) {
    return { available: false, reason: "fechada", today };
  }

  const readyBySec = secondsOfDay + (prepMinutes + EXPRESS_PICKUP_BUFFER_MINUTES) * 60;
  if (readyBySec > closesSec) return { available: false, reason: "fecha em breve", today };

  return { available: true };
}

/** Texto discreto pro checkout quando a loja está no raio mas a expressa não pode sair agora. */
export function getExpressUnavailableHint(result: Extract<ExpressAvailability, { available: false }>): string {
  const base = "Entrega expressa indisponível agora.";
  switch (result.reason) {
    case "sem horário":
      return `${base} A loja ainda não configurou o horário.`;
    case "pausada":
      return `${base} A loja pausou a entrega expressa.`;
    default:
      return result.today
        ? `${base} A loja atende de ${result.today.opens} a ${result.today.closes}.`
        : `${base} A loja não atende hoje.`;
  }
}

export interface StoreHoursInputDay {
  weekday: number;
  enabled: boolean;
  opens: string;
  closes: string;
}

/**
 * Validação compartilhada (formulário e server action). Devolve a mensagem de
 * erro ou null. Dias desligados não são validados.
 */
export function validateStoreHoursInput(days: StoreHoursInputDay[], prepMinutes: number): string | null {
  if (!(EXPRESS_PREP_MINUTES_OPTIONS as readonly number[]).includes(prepMinutes)) {
    return "Tempo de preparo inválido.";
  }
  const seen = new Set<number>();
  for (const day of days) {
    if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6 || seen.has(day.weekday)) {
      return "Dia da semana inválido.";
    }
    seen.add(day.weekday);
    if (!day.enabled) continue;

    const opens = parseTimeToMinutes(day.opens);
    const closes = parseTimeToMinutes(day.closes);
    if (opens === null || closes === null || day.opens.length !== 5 || day.closes.length !== 5) {
      return "Informe os horários no formato HH:MM.";
    }
    if (opens >= closes) return "O horário de abertura precisa ser antes do fechamento (no mesmo dia).";
  }
  return null;
}
