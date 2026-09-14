import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizationUrl } from "@/lib/mercadopago/client";
import { CheckCircle2, Circle, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PagamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, status, mp_connected_at")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!store) redirect("/minha-loja/nova");

  const isActive = store.status === "active";
  const isConnected = Boolean(store.mp_connected_at);
  const authUrl = isActive ? buildAuthorizationUrl(store.id) : null;

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">Pagamentos</h1>
        <p className="text-muted-foreground mt-1">
          Conecte sua conta Mercado Pago pra receber pelos seus pedidos.
        </p>
      </header>

      {connected && (
        <div className="mb-6 flex items-center gap-2 bg-capim/10 text-capim border border-capim/20 rounded-xl px-4 py-3 text-sm font-medium">
          <CheckCircle2 size={18} />
          Mercado Pago conectado com sucesso!
        </div>
      )}
      {error && (
        <div className="mb-6 flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl px-4 py-3 text-sm font-medium">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div
        className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm p-6"
        style={{ borderRadius: "16px" }}
      >
        {!isActive ? (
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-amber flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-dark dark:text-[#f5edd6]">
                Sua loja ainda não foi aprovada
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Você poderá conectar o Mercado Pago assim que a análise da sua loja for concluída.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 pb-5 mb-5 border-b border-border dark:border-[#3d2c1a]">
              {isConnected ? (
                <CheckCircle2 size={22} className="text-capim flex-shrink-0" />
              ) : (
                <Circle size={22} className="text-muted-foreground flex-shrink-0" />
              )}
              <div>
                <p className="font-semibold text-dark dark:text-[#f5edd6]">
                  {isConnected ? "Conectado — pronto para vender" : "Não conectado"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isConnected
                    ? "Os pagamentos dos seus pedidos vão direto pra sua conta Mercado Pago."
                    : "Sem essa conexão, sua loja não pode receber pagamentos no marketplace."}
                </p>
              </div>
            </div>

            <a
              href={authUrl!}
              className="inline-block bg-terracota hover:bg-terracota/90 text-white font-semibold text-sm px-6 py-2.5 rounded-full transition-colors"
            >
              {isConnected ? "Reconectar Mercado Pago" : "Conectar Mercado Pago"}
            </a>
          </>
        )}
      </div>
    </main>
  );
}
