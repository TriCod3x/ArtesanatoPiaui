import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { StoreCard } from "@/components/store/StoreCard";
import { CITIES_PI } from "@/lib/constants";
import type { StoreWithContacts } from "@/types";

interface SearchParams {
  cidade?: string;
}

export default async function LojasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { cidade } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("stores")
    .select("*, contacts:store_contacts(id, type, value, is_primary)")
    .eq("status", "active")
    .order("total_sales", { ascending: false });

  if (cidade) query = query.eq("city", cidade);

  const { data } = await query;
  const stores = (data ?? []) as unknown as StoreWithContacts[];

  return (
    <>
      <Header />
      <main className="flex-1 max-w-7xl mx-auto px-4 py-10">
        <h1 className="font-display text-4xl font-bold text-dark mb-2">Lojas</h1>
        <p className="text-muted-foreground mb-8">Conheça os artesãos piauienses e suas histórias</p>

        <form className="flex flex-wrap gap-3 mb-10">
          <select
            name="cidade"
            defaultValue={cidade ?? ""}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-white text-dark focus:outline-none focus:ring-2 focus:ring-terracota"
          >
            <option value="">Todas as cidades</option>
            {CITIES_PI.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <button type="submit" className="bg-terracota text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-terracota/90 transition-colors">
            Filtrar
          </button>

          {cidade && (
            <a href="/lojas" className="text-sm text-muted-foreground hover:text-terracota underline py-2">
              Limpar filtros
            </a>
          )}
        </form>

        {stores.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">Nenhuma loja encontrada.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {stores.map((store) => <StoreCard key={store.id} store={store} />)}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
