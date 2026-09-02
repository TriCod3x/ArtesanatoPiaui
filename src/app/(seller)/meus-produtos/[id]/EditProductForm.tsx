"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { updateProduct, deleteProduct } from "@/actions/products";
import { productSchema, type ProductInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload, type ExistingImage } from "@/components/shared/ImageUpload";
import type { Category, Product } from "@/types";

const selectClass =
  "w-full border border-border dark:border-[#3d2c1a] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#2a1e0f] text-dark dark:text-[#f5edd6] focus:outline-none focus:ring-2 focus:ring-terracota";

interface Props {
  storeId: string;
  product: Product;
  images: ExistingImage[];
  categories: Category[];
}

export function EditProductForm({ storeId, product, images, categories }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product.name,
      slug: product.slug,
      description: product.description ?? "",
      price: Number(product.price),
      stock: product.stock,
      category_id: product.category_id,
      status: product.status,
    },
  });

  const onSubmit = async (data: ProductInput) => {
    setSaving(true);
    const res = await updateProduct(product.id, data);
    setSaving(false);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Produto atualizado!");
      router.refresh();
    }
  };

  const onDelete = async () => {
    if (!confirm("Excluir este produto? As imagens também serão removidas.")) return;
    setDeleting(true);
    const res = await deleteProduct(product.id);
    if (res?.error) {
      toast.error(res.error);
      setDeleting(false);
    } else {
      toast.success("Produto excluído.");
      router.push("/meus-produtos");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-6 sm:p-8 space-y-3">
        <Label className="dark:text-[#c4622d]">Fotos do produto</Label>
        <p className="text-xs text-muted-foreground dark:text-[#8a6a4a]">
          Até 5 fotos. A primeira (capa) é a que aparece na vitrine — use as setas para reordenar.
        </p>
        <ImageUpload storeId={storeId} productId={product.id} existing={images} />
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6 bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-8"
      >
        <div className="space-y-2">
          <Label htmlFor="name" className="dark:text-[#c4622d]">Nome do produto</Label>
          <Input id="name" {...register("name")} className={errors.name ? "border-destructive" : ""} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug" className="dark:text-[#c4622d]">Slug (URL)</Label>
          <Input id="slug" {...register("slug")} className={errors.slug ? "border-destructive" : ""} />
          {errors.slug && <p className="text-sm text-destructive">{errors.slug.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="category_id" className="dark:text-[#c4622d]">Categoria</Label>
          <select id="category_id" {...register("category_id")} className={selectClass}>
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="dark:text-[#c4622d]">Descrição</Label>
          <Textarea
            id="description"
            rows={5}
            {...register("description")}
            className={errors.description ? "border-destructive" : ""}
          />
          {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price" className="dark:text-[#c4622d]">Preço (R$)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              {...register("price", { valueAsNumber: true })}
              className={errors.price ? "border-destructive" : ""}
            />
            {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock" className="dark:text-[#c4622d]">Estoque</Label>
            <Input
              id="stock"
              type="number"
              min="0"
              {...register("stock", { valueAsNumber: true })}
              className={errors.stock ? "border-destructive" : ""}
            />
            {errors.stock && <p className="text-sm text-destructive">{errors.stock.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status" className="dark:text-[#c4622d]">Status</Label>
          <select id="status" {...register("status")} className={selectClass}>
            <option value="active">Ativo (visível na loja)</option>
            <option value="inactive">Inativo (oculto)</option>
            <option value="out_of_stock">Sem estoque</option>
          </select>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            disabled={deleting}
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Excluir produto
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="flex-1 bg-terracota hover:bg-terracota/90 text-white font-semibold gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </form>
    </div>
  );
}
