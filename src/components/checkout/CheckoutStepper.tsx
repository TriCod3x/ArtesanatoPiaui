import { Check } from "lucide-react";

export type CheckoutStep = "endereco" | "entrega" | "pagamento";

const STEPS: { key: CheckoutStep; label: string }[] = [
  { key: "endereco", label: "Endereço" },
  { key: "entrega", label: "Entrega" },
  { key: "pagamento", label: "Pagamento" },
];

export function CheckoutStepper({ current }: { current: CheckoutStep }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <ol className="flex items-center gap-2 mb-6" aria-label="Etapas da compra">
      {STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step.key} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className="flex items-center gap-1.5">
              <span
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0 transition-colors ${
                  done
                    ? "bg-terracota text-white"
                    : active
                      ? "bg-terracota/15 text-terracota border-2 border-terracota"
                      : "bg-transparent text-[#5A4632] dark:text-[#D9C4A0] border-2 border-[#8a6a4a]"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check size={13} /> : i + 1}
              </span>
              <span
                className={`text-sm whitespace-nowrap ${
                  active
                    ? "font-semibold text-dark dark:text-[#f5edd6]"
                    : done
                      ? "text-dark dark:text-[#f5edd6]"
                      : "text-[#5A4632] dark:text-[#D9C4A0]"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={`h-px flex-1 min-w-4 ${done ? "bg-terracota" : "bg-[#8a6a4a]/40"}`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
