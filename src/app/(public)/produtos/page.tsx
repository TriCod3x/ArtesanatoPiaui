import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/product/ProductCard";
import { CITIES_PI } from "@/lib/constants";
import type { ProductWithRelations, Category } from "@/types";

interface SearchParams {
  q?: string;
  categoria?: string;
  cidade?: string;
  preco_min?: string;
  preco_max?: string;
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, categoria, cidade, preco_min, preco_max } = await searchParams;
  const supabase = await createClient();

  const [productsRes, categoriesRes] = await Promise.all([
    supabase
      .from("products")
      .select(`
        *,
        store:stores(id, name, slug, logo_url, city, state),
        category:categories(id, name, slug),
        images:product_images(id, url, position, is_cover)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(48),
    supabase.from("categories").select("*").order("name"),
  ]);

  let products = (productsRes.data ?? []) as unknown as ProductWithRelations[];
  const categories = (categoriesRes.data ?? []) as Category[];

  if (q) products = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  if (categoria) products = products.filter((p) => p.category?.slug === categoria);
  if (cidade) products = products.filter((p) => (p.store as { city?: string } | undefined)?.city === cidade);
  if (preco_min) products = products.filter((p) => p.price >= parseFloat(preco_min));
  if (preco_max) products = products.filter((p) => p.price <= parseFloat(preco_max));

  const hasFilters = !!(q || categoria || cidade || preco_min || preco_max);

  return (
    <>
      <Header />
      <main className="flex-1 max-w-7xl mx-auto px-4 py-10">
        <h1 className="font-display text-4xl font-bold text-dark mb-2">Produtos</h1>
        <p className="text-muted-foreground mb-8">
          {q ? `Resultados para "${q}"` : "Artesanato piauiense autêntico"}
        </p>

        <form className="flex flex-wrap gap-3 mb-10">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar..."
            className="border border-border rounded-lg px-3 py-2 text-sm bg-white text-dark focus:outline-none focus:ring-2 focus:ring-terracota min-w-[180px]"
          />

          <select
            name="categoria"
            defaultValue={categoria ?? ""}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-white text-dark focus:outline-none focus:ring-2 focus:ring-terracota"
          >
            <option value="">Todas as categorias</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>

          <select
            name="cidade"
            defaultValue={cidade ?? ""}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-white text-dark focus:outline-none focus:ring-2 focus:ring-terracota"
          >
            <option value="">Todas as cidades</option>
            {CITIES_PI.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <input name="preco_min" type="number" defaultValue={preco_min ?? ""} placeholder="Preço mín." className="border border-border rounded-lg px-3 py-2 text-sm bg-white text-dark focus:outline-none focus:ring-2 focus:ring-terracota w-28" />
          <input name="preco_max" type="number" defaultValue={preco_max ?? ""} placeholder="Preço máx." className="border border-border rounded-lg px-3 py-2 text-sm bg-white text-dark focus:outline-none focus:ring-2 focus:ring-terracota w-28" />

          <button type="submit" className="bg-terracota text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-terracota/90 transition-colors">Filtrar</button>
          {hasFilters && <a href="/produtos" className="text-sm text-muted-foreground hover:text-terracota underline py-2">Limpar</a>}
        </form>

        <p className="text-sm text-muted-foreground mb-6">
          {products.length} produto{products.length !== 1 ? "s" : ""} encontrado{products.length !== 1 ? "s" : ""}
        </p>

        {products.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {products.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
