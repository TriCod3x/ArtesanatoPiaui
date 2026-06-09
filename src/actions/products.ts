"use server";

import { createClient } from "@/lib/supabase/server";
import type { ProductInput } from "@/lib/validations";

export async function createProduct(data: ProductInput) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!store) return { error: "Você precisa ter uma loja cadastrada." };

  const { error } = await supabase.from("products").insert({
    store_id: store.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    price: data.price,
    stock: data.stock,
    category_id: data.category_id ?? null,
    tags: data.tags ?? [],
    status: data.status,
    weight_grams: data.weight_grams ?? null,
  });

  if (error) {
    if (error.code === "23505") return { error: "Já existe um produto com esse slug." };
    return { error: "Erro ao criar produto. Tente novamente." };
  }

  return { success: true };
}

export async function updateProduct(productId: string, data: Partial<ProductInput>) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!store) return { error: "Loja não encontrada." };

  const { error } = await supabase
    .from("products")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("store_id", store.id);

  if (error) return { error: "Erro ao atualizar produto." };

  return { success: true };
}

export async function deleteProduct(productId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!store) return { error: "Loja não encontrada." };

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("store_id", store.id);

  if (error) return { error: "Erro ao deletar produto." };

  return { success: true };
}

export async function uploadProductImage(productId: string, file: File, position: number) {
  const supabase = await createClient();

  const ext = file.name.split(".").pop();
  const path = `products/${productId}/${position}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(path, file, { upsert: true });

  if (uploadError) return { error: "Erro ao fazer upload da imagem." };

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);

  const { error: dbError } = await supabase.from("product_images").insert({
    product_id: productId,
    url: data.publicUrl,
    position,
    is_cover: position === 0,
  });

  if (dbError) return { error: "Erro ao salvar imagem." };

  return { url: data.publicUrl };
}
