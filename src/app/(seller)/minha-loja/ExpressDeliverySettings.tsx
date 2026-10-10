"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Zap, Pause, Play } from "lucide-react";
import { saveExpressSettings } from "@/actions/store-hours";
import { EXPRESS_PREP_MINUTES_OPTIONS, WEEKDAY_LABELS } from "@/lib/constants";
import { formatHHMM, validateStoreHoursInput, type StoreHoursInputDay, type StoreHoursRow } from "@/lib/store-hours";
import { Button } from "@/components/ui/button";

interface ExpressDeliverySettingsProps {
  hours: StoreHoursRow[];
  prepMinutes: number;
  paused: boolean;
}

const DEFAULT_OPENS = "08:00";
const DEFAULT_CLOSES = "18:00";

// Segunda a domingo na tela; weekday segue 0=domingo..6=sábado no banco.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const timeInputClass =
  "border border-border dark:border-[#3d2c1a] rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-[#1a1208] text-dark dark:text-[#f5edd6] focus:outline-none focus:ring-2 focus:ring-terracota disabled:opacity-50";

export function ExpressDeliverySettings({ hours, prepMinutes: initialPrep, paused: initialPaused }: ExpressDeliverySettingsProps) {
  const router = useRouter();
  const [days, setDays] = useState<StoreHoursInputDay[]>(() =>
    DISPLAY_ORDER.map((weekday) => {
      const row = hours.find((h) => h.weekday === weekday);
      return {
        weekday,
        enabled: !!row,
        opens: row ? formatHHMM(row.opens) : DEFAULT_OPENS,
        closes: row ? formatHHMM(row.closes) : DEFAULT_CLOSES,
      };
    }),
  );
  const [prepMinutes, setPrepMinutes] = useState(initialPrep);
  const [paused, setPaused] = useState(initialPaused);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateDay = (weekday: number, patch: Partial<StoreHoursInputDay>) => {
    setDays((current) => current.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
    setError(null);
  };

  const save = async (nextPaused: boolean) => {
    const validationError = validateStoreHoursInput(days, prepMinutes);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    const result = await saveExpressSettings({ days, prepMinutes, paused: nextPaused });
    setSaving(false);

    if ("error" in result) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    setPaused(nextPaused);
    setError(null);
    toast.success(nextPaused ? "Entrega expressa pausada." : "Configurações da entrega expressa salvas!");
    router.refresh();
  };

  const hasAnyDay = days.some((d) => d.enabled);
  const prepOptions = (EXPRESS_PREP_MINUTES_OPTIONS as readonly number[]).includes(prepMinutes)
    ? EXPRESS_PREP_MINUTES_OPTIONS
    : [...EXPRESS_PREP_MINUTES_OPTIONS, prepMinutes].sort((a, b) => a - b);

  return (
    <section className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-6 mt-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-dark dark:text-[#f5edd6] text-sm uppercase tracking-wide flex items-center gap-1.5">
            <Zap size={14} className="text-terracota" /> Entrega expressa
          </h2>
          <p className="text-xs text-muted-foreground dark:text-[#8a6a4a] mt-1">
            Sem horário configurado a entrega expressa não é oferecida aos compradores. Ela só aparece
            dentro do horário, com tempo pra você preparar o pedido antes de fechar.
          </p>
        </div>
        {paused && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber/15 text-amber whitespace-nowrap">
            Pausada
          </span>
        )}
      </div>

      <div className="space-y-2">
        {days.map((day) => (
          <div key={day.weekday} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <label className="flex items-center gap-2 w-28 text-sm text-dark dark:text-[#f5edd6]">
              <input
                type="checkbox"
                checked={day.enabled}
                onChange={(e) => updateDay(day.weekday, { enabled: e.target.checked })}
                className="accent-terracota"
              />
              {WEEKDAY_LABELS[day.weekday]}
            </label>
            {day.enabled ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>de</span>
                <input
                  type="time"
                  value={day.opens}
                  onChange={(e) => updateDay(day.weekday, { opens: e.target.value })}
                  className={timeInputClass}
                  aria-label={`${WEEKDAY_LABELS[day.weekday]}: abre às`}
                />
                <span>até</span>
                <input
                  type="time"
                  value={day.closes}
                  onChange={(e) => updateDay(day.weekday, { closes: e.target.value })}
                  className={timeInputClass}
                  aria-label={`${WEEKDAY_LABELS[day.weekday]}: fecha às`}
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Fechado</span>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="express-prep" className="text-sm font-medium text-dark dark:text-[#f5edd6]">
          Tempo de preparo
        </label>
        <div>
          <select
            id="express-prep"
            value={prepMinutes}
            onChange={(e) => {
              setPrepMinutes(Number(e.target.value));
              setError(null);
            }}
            className="border border-border dark:border-[#3d2c1a] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1a1208] text-dark dark:text-[#f5edd6] focus:outline-none focus:ring-2 focus:ring-terracota"
          >
            {prepOptions.map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground dark:text-[#8a6a4a]">
          A entrega expressa deixa de ser oferecida quando falta menos que isso (mais uma folga pro motorista) pra fechar.
        </p>
      </div>

      {!hasAnyDay && (
        <p className="text-xs text-amber">Nenhum dia ligado: a entrega expressa não será oferecida.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-3 pt-1">
        <Button
          type="button"
          onClick={() => save(paused)}
          disabled={saving}
          className="bg-terracota hover:bg-terracota/90 text-white font-semibold"
        >
          {saving ? "Salvando..." : "Salvar entrega expressa"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => save(!paused)}
          disabled={saving}
          className="gap-1.5 dark:border-[#3d2c1a] dark:text-[#f5edd6]"
        >
          {paused ? (
            <>
              <Play size={14} /> Retomar entrega expressa
            </>
          ) : (
            <>
              <Pause size={14} /> Pausar entrega expressa
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
