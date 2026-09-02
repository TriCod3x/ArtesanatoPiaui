"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { saveBankDetails } from "@/actions/payments";
import { bankDetailsSchema, type BankDetailsInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BANK_ACCOUNT_TYPES } from "@/lib/constants";

interface Props {
  banks: { code: string; name: string }[];
  hasRecipient: boolean;
  defaults: BankDetailsInput;
}

const selectClass =
  "w-full border border-border dark:border-[#3d2c1a] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#2a1e0f] text-dark dark:text-[#f5edd6] focus:outline-none focus:ring-2 focus:ring-terracota";

export function BankDetailsForm({ banks, hasRecipient, defaults }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BankDetailsInput>({
    resolver: zodResolver(bankDetailsSchema),
    defaultValues: defaults,
  });

  const onSubmit = async (data: BankDetailsInput) => {
    setSaving(true);
    const result = await saveBankDetails(data);
    setSaving(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }
    if (result?.warning) {
      toast.warning(result.warning);
    } else {
      toast.success("Recebedor criado — pronto para vender!");
    }
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5 bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-6 sm:p-8"
    >
      <div className="space-y-2">
        <Label htmlFor="bank_code" className="dark:text-terracota">
          Banco
        </Label>
        <select id="bank_code" {...register("bank_code")} className={selectClass}>
          <option value="">Selecione o banco</option>
          {banks.map((b) => (
            <option key={b.code} value={b.code}>
              {b.code} — {b.name}
            </option>
          ))}
        </select>
        {errors.bank_code && (
          <p className="text-sm text-destructive">{errors.bank_code.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="bank_agency" className="dark:text-terracota">
            Agência
          </Label>
          <Input
            id="bank_agency"
            inputMode="numeric"
            placeholder="0001"
            {...register("bank_agency")}
            className={errors.bank_agency ? "border-destructive" : ""}
          />
          <p className="text-xs text-muted-foreground">Sem o dígito.</p>
          {errors.bank_agency && (
            <p className="text-sm text-destructive">{errors.bank_agency.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bank_account_type" className="dark:text-terracota">
            Tipo de conta
          </Label>
          <select
            id="bank_account_type"
            {...register("bank_account_type")}
            className={selectClass}
          >
            {BANK_ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {errors.bank_account_type && (
            <p className="text-sm text-destructive">
              {errors.bank_account_type.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_100px] gap-4">
        <div className="space-y-2">
          <Label htmlFor="bank_account" className="dark:text-terracota">
            Conta
          </Label>
          <Input
            id="bank_account"
            inputMode="numeric"
            placeholder="12345678"
            {...register("bank_account")}
            className={errors.bank_account ? "border-destructive" : ""}
          />
          {errors.bank_account && (
            <p className="text-sm text-destructive">{errors.bank_account.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bank_account_digit" className="dark:text-terracota">
            Dígito
          </Label>
          <Input
            id="bank_account_digit"
            maxLength={2}
            placeholder="0"
            {...register("bank_account_digit")}
            className={errors.bank_account_digit ? "border-destructive" : ""}
          />
          {errors.bank_account_digit && (
            <p className="text-sm text-destructive">
              {errors.bank_account_digit.message}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        A conta precisa estar no mesmo CPF/CNPJ informado no cadastro de vendedor.
      </p>

      <Button
        type="submit"
        disabled={saving}
        className="w-full bg-terracota hover:bg-terracota/90 text-white font-semibold h-11 gap-2"
      >
        {saving && <Loader2 size={16} className="animate-spin" />}
        {hasRecipient ? "Atualizar dados bancários" : "Salvar e criar recebedor"}
      </Button>
    </form>
  );
}
