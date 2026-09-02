import { createClient } from "@/lib/supabase/server";
import { SellerSignupWizard } from "./SellerSignupWizard";

export const metadata = {
  title: "Abra sua loja — Artesanatos Piauí",
};

export default async function VenderCadastroPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialStep = 1;
  let authedEmail: string | null = null;
  let initialValues: Record<string, string> = {};
  let redirectAfter = "/minha-loja/nova";

  if (user) {
    authedEmail = user.email ?? null;
    initialStep = 2;

    const [{ data: verification }, { data: store }] = await Promise.all([
      supabase
        .from("seller_verifications")
        .select(
          "cpf, cnpj, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state",
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("stores").select("id").eq("owner_id", user.id).maybeSingle(),
    ]);

    if (store) redirectAfter = "/dashboard";

    if (verification) {
      initialValues = {
        cpf: verification.cpf ?? "",
        cnpj: verification.cnpj ?? "",
        cep: verification.cep ?? "",
        address_street: verification.address_street ?? "",
        address_number: verification.address_number ?? "",
        address_complement: verification.address_complement ?? "",
        address_neighborhood: verification.address_neighborhood ?? "",
        address_city: verification.address_city ?? "",
        address_state: verification.address_state ?? "",
      };
    }
  }

  return (
    <div className="min-h-screen bg-[#faf7f2] dark:bg-[#1a1208] flex items-start sm:items-center justify-center px-4 py-12 transition-colors duration-300">
      <SellerSignupWizard
        initialStep={initialStep}
        authedEmail={authedEmail}
        initialValues={initialValues}
        redirectAfter={redirectAfter}
      />
    </div>
  );
}
