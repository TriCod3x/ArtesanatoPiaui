import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { BankDetailsForm } from "./BankDetailsForm";
import { BRAZILIAN_BANKS } from "@/lib/constants";

export const metadata = { title: "Recebimento — Artesanatos Piauí" };

export default async function PagamentosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, status, pagarme_recipient_id, commission_rate")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!store) redirect("/minha-loja/nova");

  // Só acessível com a loja aprovada.
  if (store.status !== "active") {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <BackLink />
        <div className="bg-amber/10 border border-amber/30 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle className="text-amber shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-dark dark:text-[#f5edd6]">
              Recebimento disponível após a aprovação da loja
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Assim que sua loja for aprovada pela nossa equipe, você poderá
              cadastrar sua conta bancária aqui para receber pelas vendas.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { data: verification } = await supabase
    .from("seller_verifications")
    .select(
      "bank_code, bank_agency, bank_account, bank_account_digit, bank_account_type, pagarme_recipient_id",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const hasRecipient = !!(store.pagarme_recipient_id || verification?.pagarme_recipient_id);
  const sellerShare = 100 - Number(store.commission_rate);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <BackLink />

      <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] mb-2">
        Recebimento
      </h1>
      <p className="text-muted-foreground mb-6">
        Cadastre a conta bancária que vai receber o valor das suas vendas. Você
        recebe <strong>{sellerShare}%</strong> de cada venda; a plataforma retém{" "}
        {Number(store.commission_rate)}% de comissão.
      </p>

      {/* Status */}
      <div
        className={`rounded-xl p-4 flex items-center gap-3 mb-8 border ${
          hasRecipient
            ? "bg-capim/10 border-capim/30"
            : "bg-cream dark:bg-[#2a1e0f] border-border dark:border-[#3d2c1a]"
        }`}
      >
        {hasRecipient ? (
          <>
            <CheckCircle2 className="text-capim shrink-0" size={20} />
            <p className="text-sm font-medium text-dark dark:text-[#f5edd6]">
              Recebedor criado — pronto para vender
            </p>
          </>
        ) : (
          <>
            <AlertCircle className="text-muted-foreground shrink-0" size={20} />
            <p className="text-sm font-medium text-dark dark:text-[#f5edd6]">
              Conta bancária não cadastrada
            </p>
          </>
        )}
      </div>

      <BankDetailsForm
        banks={BRAZILIAN_BANKS}
        hasRecipient={hasRecipient}
        defaults={{
          bank_code: verification?.bank_code ?? "",
          bank_agency: verification?.bank_agency ?? "",
          bank_account: verification?.bank_account ?? "",
          bank_account_digit: verification?.bank_account_digit ?? "",
          bank_account_type:
            (verification?.bank_account_type as "checking" | "savings" | null) ??
            "checking",
        }}
      />
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-terracota mb-6"
    >
      <ArrowLeft size={15} /> Voltar ao dashboard
    </Link>
  );
}
