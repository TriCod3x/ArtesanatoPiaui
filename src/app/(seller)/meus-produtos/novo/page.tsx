"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createProduct } from "@/actions/products";
import { productSchema, type ProductInput } from "@/lib/validations";
import { generateSlug } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Category } from "@/types";

export default function NovoProdutoPage() {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const router = useRouter();

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: { status: "active", stock: 1 },
  });

  useEffect(() => {
    createClient().from("categories").select("*").order("name").then(({ data }) => {
      if (data) setCategories(data as Category[]);
    });
  }, []);

  const onSubmit = async (data: ProductInput) => {
    setLoading(true);
    const result = await createProduct(data);
    if (result?.error) {
      toast.error(result.error);
      setLoading(false);
    } else {
      toast.success("Produto criado com sucesso!");
      router.push("/meus-produtos");
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen dark:bg-[#1a1208] transition-colors duration-300">
      <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] mb-2">Novo produto</h1>
      <p className="text-muted-foreground mb-8">Cadastre um novo produto na sua loja.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-8">
        <div className="space-y-2">
          <Label htmlFor="name" className="dark:text-terracota">Nome do produto</Label>
          <Input
            id="name"
            placeholder="Ex: Vaso de Cerâmica Sertaneja"
            {...register("name")}
            onBlur={(e) => setValue("slug", generateSlug(e.target.value))}
            className={errors.name ? "border-destructive" : ""}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug" className="dark:text-terracota">Slug (URL)</Label>
          <Input id="slug" {...register("slug")} className={errors.slug ? "border-destructive" : ""} />
          {errors.slug && <p className="text-sm text-destructive">{errors.slug.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="category_id" className="dark:text-terracota">Categoria</Label>
          <select
            id="category_id"
            {...register("category_id")}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white text-dark focus:outline-none focus:ring-2 focus:ring-terracota"
          >
            <option value="">Sem categoria</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="dark:text-terracota">Descrição</Label>
          <Textarea
            id="description"
            rows={5}
            placeholder="Descreva seu produto: materiais, técnicas, tamanho, história..."
            {...register("description")}
            className={errors.description ? "border-destructive" : ""}
          />
          {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price" className="dark:text-terracota">Preço (R$)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              {...register("price", { valueAsNumber: true })}
              className={errors.price ? "border-destructive" : ""}
            />
            {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock" className="dark:text-terracota">Estoque</Label>
            <Input
              id="stock"
              type="number"
              min="0"
              placeholder="1"
              {...register("stock", { valueAsNumber: true })}
              className={errors.stock ? "border-destructive" : ""}
            />
            {errors.stock && <p className="text-sm text-destructive">{errors.stock.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status" className="dark:text-terracota">Status</Label>
          <select
            id="status"
            {...register("status")}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white text-dark focus:outline-none focus:ring-2 focus:ring-terracota"
          >
            <option value="active">Ativo (visível na loja)</option>
            <option value="inactive">Inativo (oculto)</option>
            <option value="out_of_stock">Sem estoque</option>
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1 dark:border-[#3d2c1a] dark:text-[#f5edd6]" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1 bg-terracota hover:bg-terracota/90 text-white font-semibold" disabled={loading}>
            {loading ? "Salvando..." : "Criar produto"}
          </Button>
        </div>
      </form>
    </main>
  );
}
