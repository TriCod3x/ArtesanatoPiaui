import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import type { Product, Category } from "@/types";

export default async function MeusProdutosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!store) redirect("/minha-loja/nova");

  const { data } = await supabase
    .from("products")
    .select("*, category:categories(id, name, slug)")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  const products = (data ?? []) as unknown as (Product & { category: Category | null })[];

  const statusLabel: Record<string, string> = {
    active: "Ativo",
    inactive: "Inativo",
    out_of_stock: "Sem estoque",
  };

  const statusVariant = (status: string) =>
    status === "active" ? "bg-capim/20 text-capim border-0" : "bg-muted text-muted-foreground";

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-dark">Meus produtos</h1>
          <p className="text-muted-foreground mt-1">{products.length} produto{products.length !== 1 ? "s" : ""} cadastrado{products.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/meus-produtos/novo">
          <Button className="bg-terracota hover:bg-terracota/90 text-white gap-2">
            <Plus size={16} /> Novo produto
          </Button>
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg mb-4">Você ainda não tem produtos cadastrados.</p>
          <Link href="/meus-produtos/novo">
            <Button className="bg-terracota hover:bg-terracota/90 text-white gap-2">
              <Plus size={16} /> Criar primeiro produto
            </Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-dark">Produto</th>
                <th className="text-left px-4 py-3 font-semibold text-dark hidden md:table-cell">Categoria</th>
                <th className="text-right px-4 py-3 font-semibold text-dark">Preço</th>
                <th className="text-right px-4 py-3 font-semibold text-dark hidden sm:table-cell">Estoque</th>
                <th className="text-center px-4 py-3 font-semibold text-dark">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-dark">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-cream/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-dark line-clamp-1">{product.name}</p>
                    <p className="text-xs text-muted-foreground">/produtos/{product.slug}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {product.category?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-terracota">
                    {formatPrice(product.price)}
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className={product.stock === 0 ? "text-destructive font-semibold" : "text-dark"}>
                      {product.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={statusVariant(product.status)}>
                      {statusLabel[product.status] ?? product.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/meus-produtos/${product.id}`}>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-terracota h-8 w-8">
                        <Pencil size={14} />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
