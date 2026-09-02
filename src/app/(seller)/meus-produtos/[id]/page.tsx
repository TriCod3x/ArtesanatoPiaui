import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EditProductForm } from "./EditProductForm";
import type { Category } from "@/types";

export const metadata = { title: "Editar produto — Artesanatos Piauí" };

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!store) redirect("/minha-loja/nova");

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "*, images:product_images(id, url, position, is_cover)",
      )
      .eq("id", id)
      .eq("store_id", store.id)
      .maybeSingle(),
    supabase.from("categories").select("*").order("name"),
  ]);

  if (!product) notFound();

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen dark:bg-[#1a1208] transition-colors duration-300">
      <Link
        href="/meus-produtos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-terracota mb-6"
      >
        <ArrowLeft size={15} /> Meus produtos
      </Link>

      <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] mb-2">
        Editar produto
      </h1>
      <p className="text-muted-foreground mb-8">{product.name}</p>

      <EditProductForm
        storeId={store.id}
        product={product}
        images={product.images ?? []}
        categories={(categories ?? []) as Category[]}
      />
    </main>
  );
}
