import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Package, ShoppingBag, DollarSign, Star, AlertCircle, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "seller") redirect("/");

  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (!store) redirect("/minha-loja/nova");

  const isPending = store.status === "pending";

  const { count: productCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("store_id", store.id)
    .eq("status", "active");

  const hasProducts = (productCount ?? 0) > 0;

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">Dashboard</h1>
          <p className="text-muted-foreground mt-1">{store.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/lojas/${store.slug}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2 border-border dark:border-[#3d2c1a] text-dark dark:text-[#f5edd6] hover:border-terracota/40 hidden sm:flex">
              <ExternalLink size={15} /> Ver loja pública
            </Button>
          </Link>
          <Link href="/meus-produtos/novo">
            <Button className="bg-terracota hover:bg-terracota/90 text-white gap-2">
              <Plus size={16} /> Novo produto
            </Button>
          </Link>
        </div>
      </div>

      {/* Pending store alert */}
      {isPending && (
        <div className="bg-amber/10 border border-amber/30 rounded-xl p-4 flex items-start gap-3 mb-8">
          <AlertCircle className="text-amber flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-dark dark:text-[#f5edd6]">Sua loja está em análise</p>
            <p className="text-sm text-muted-foreground mt-1">
              Nossa equipe revisará sua loja em breve. Você pode cadastrar produtos enquanto aguarda a aprovação.
            </p>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        {[
          {
            icon: Package,
            label: "Produtos ativos",
            value: productCount ?? 0,
            color: "text-terracota",
            bg: "bg-terracota/10",
          },
          {
            icon: ShoppingBag,
            label: "Pedidos pendentes",
            value: 0,
            color: "text-capim",
            bg: "bg-capim/10",
          },
          {
            icon: DollarSign,
            label: "Vendas do mês",
            value: formatPrice(0),
            color: "text-amber",
            bg: "bg-amber/10",
          },
          {
            icon: Star,
            label: "Avaliação média",
            value: store.rating && store.rating > 0 ? store.rating.toFixed(1) : "–",
            color: "text-dark dark:text-[#f5edd6]",
            bg: "bg-dark/10 dark:bg-[#f5edd6]/10",
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-6">
            <div className={`${stat.bg} ${stat.color} w-10 h-10 rounded-xl flex items-center justify-center mb-4`}>
              <stat.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-dark dark:text-[#f5edd6]">{stat.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Empty products state */}
      {!hasProducts && (
        <div className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-10 text-center mb-8">
          <div className="w-14 h-14 bg-terracota/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package size={26} className="text-terracota" />
          </div>
          <h2 className="font-display text-xl font-bold text-dark dark:text-[#f5edd6] mb-2">
            Seu primeiro produto está a um clique
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
            Adicione produtos à sua loja e comece a vender para compradores de todo o Brasil.
          </p>
          <Link href="/meus-produtos/novo">
            <Button className="bg-terracota hover:bg-terracota/90 text-white gap-2 font-semibold">
              <Plus size={16} /> Criar primeiro produto
            </Button>
          </Link>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { href: "/meus-produtos", label: "Gerenciar produtos", icon: Package },
          { href: "/minha-loja", label: "Editar loja", icon: ShoppingBag },
          { href: "/pedidos", label: "Ver pedidos", icon: DollarSign },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 p-4 bg-white dark:bg-[#2a1e0f] rounded-xl border border-border dark:border-[#3d2c1a] hover:border-terracota/40 hover:shadow-sm transition-all group"
          >
            <item.icon size={18} className="text-terracota" />
            <span className="font-medium text-dark dark:text-[#f5edd6] group-hover:text-terracota transition-colors text-sm">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
