"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";
import { MAX_INSTALLMENTS } from "@/lib/constants";

interface Props {
  total: number;
  disabled?: boolean;
  onToken: (cardToken: string, installments: number) => void | Promise<void>;
}

const onlyDigits = (v: string) => v.replace(/\D/g, "");

/**
 * Tokeniza o cartão no navegador via API pública do Pagar.me. O número, CVV e
 * validade NUNCA são enviados ao nosso servidor — apenas o `card_token`.
 * https://api.pagar.me/core/v5/tokens?appId=<public_key>
 */
async function tokenizeCard(card: {
  number: string;
  holder_name: string;
  exp_month: string;
  exp_year: string;
  cvv: string;
}): Promise<string> {
  const publicKey = process.env.NEXT_PUBLIC_PAGARME_PUBLIC_KEY;
  if (!publicKey) throw new Error("Chave pública do Pagar.me não configurada.");

  const res = await fetch(
    `https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(publicKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "card", card }),
    },
  );

  const data = (await res.json()) as { id?: string; message?: string; errors?: unknown };
  if (!res.ok || !data.id) {
    throw new Error(data.message ?? "Não foi possível validar o cartão.");
  }
  return data.id;
}

export function CardForm({ total, disabled, onToken }: Props) {
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [installments, setInstallments] = useState(1);
  const [processing, setProcessing] = useState(false);

  const busy = processing || disabled;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const [mm, yy] = expiry.split("/").map((s) => s.trim());
    if (!mm || !yy || onlyDigits(number).length < 13 || onlyDigits(cvv).length < 3) {
      toast.error("Confira os dados do cartão.");
      return;
    }

    setProcessing(true);
    try {
      const token = await tokenizeCard({
        number: onlyDigits(number),
        holder_name: name.trim(),
        exp_month: onlyDigits(mm),
        exp_year: onlyDigits(yy).slice(-2),
        cvv: onlyDigits(cvv),
      });
      await onToken(token, installments);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar o cartão.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="card-number" className="dark:text-terracota">Número do cartão</Label>
        <Input
          id="card-number"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="0000 0000 0000 0000"
          value={number}
          onChange={(e) =>
            setNumber(
              onlyDigits(e.target.value)
                .slice(0, 19)
                .replace(/(\d{4})(?=\d)/g, "$1 "),
            )
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="card-name" className="dark:text-terracota">Nome impresso no cartão</Label>
        <Input
          id="card-name"
          autoComplete="cc-name"
          placeholder="COMO ESTÁ NO CARTÃO"
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="card-expiry" className="dark:text-terracota">Validade</Label>
          <Input
            id="card-expiry"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/AA"
            value={expiry}
            onChange={(e) => {
              const d = onlyDigits(e.target.value).slice(0, 4);
              setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="card-cvv" className="dark:text-terracota">CVV</Label>
          <Input
            id="card-cvv"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            value={cvv}
            onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="card-installments" className="dark:text-terracota">Parcelas</Label>
        <select
          id="card-installments"
          value={installments}
          onChange={(e) => setInstallments(Number(e.target.value))}
          className="w-full border border-border dark:border-[#3d2c1a] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#2a1e0f] text-dark dark:text-[#f5edd6] focus:outline-none focus:ring-2 focus:ring-terracota"
        >
          {Array.from({ length: MAX_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}× de {formatPrice(total / n)} {n === 1 ? "(à vista)" : "sem juros"}
            </option>
          ))}
        </select>
      </div>

      <Button
        type="submit"
        disabled={busy}
        className="w-full bg-terracota hover:bg-terracota/90 text-white font-semibold h-11 gap-2"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
        Pagar {formatPrice(total)}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Os dados do cartão são enviados diretamente à Pagar.me e não passam pelos
        nossos servidores.
      </p>
    </form>
  );
}
