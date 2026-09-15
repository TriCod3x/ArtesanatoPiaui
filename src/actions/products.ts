"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductInput } from "@/lib/validations";
import type { TablesUpdate } from "@/types/database";

const PRODUCT_IMAGES_BUCKET = "product-images";

async function getOwnedStore() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." as const };

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!store) return { error: "Você precisa ter uma loja cadastrada." as const };
  return { supabase, user, store };
}

export async function createProduct(data: ProductInput) {
  const ctx = await getOwnedStore();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, store } = ctx;

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      store_id: store.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      price: data.price,
      stock: data.stock,
      category_id: data.category_id || null,
      tags: data.tags ?? [],
      status: data.status,
      weight_grams: data.weight_grams,
      height_cm: data.height_cm,
      width_cm: data.width_cm,
      length_cm: data.length_cm,
    })
    .select("id")
    .single();

  if (error || !product) {
    if (error?.code === "23505")
      return { error: "Já existe um produto com esse slug." };
    return { error: "Erro ao criar produto. Tente novamente." };
  }

  return { success: true as const, productId: product.id, storeId: store.id };
}

export async function updateProduct(
  productId: string,
  data: Partial<ProductInput>,
) {
  const ctx = await getOwnedStore();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, store } = ctx;

  const { category_id, ...rest } = data;
  const patch: TablesUpdate<"products"> = {
    ...rest,
    updated_at: new Date().toISOString(),
  };
  if (category_id !== undefined) patch.category_id = category_id || null;

  const { error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", productId)
    .eq("store_id", store.id);

  if (error) return { error: "Erro ao atualizar produto." };

  revalidatePath(`/meus-produtos/${productId}`);
  revalidatePath("/meus-produtos");
  return { success: true as const };
}

export async function deleteProduct(productId: string) {
  const ctx = await getOwnedStore();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, store } = ctx;

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("store_id", store.id);

  if (error) return { error: "Erro ao deletar produto." };

  revalidatePath("/meus-produtos");
  return { success: true as const };
}

// ── Imagens do produto ─────────────────────────────────────────────────────

async function assertOwnsProduct(productId: string) {
  const ctx = await getOwnedStore();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, store } = ctx;

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("store_id", store.id)
    .maybeSingle();

  if (!product) return { error: "Produto não encontrado." as const };
  return { supabase, store };
}

/**
 * Registra em `product_images` as imagens já enviadas para o Storage.
 * Recebe URLs públicas; a de menor `position` vira a capa (`is_cover`).
 */
export async function attachProductImages(
  productId: string,
  images: { url: string; position: number }[],
) {
  const ctx = await assertOwnsProduct(productId);
  if ("error" in ctx) return { error: ctx.error };
  const { supabase } = ctx;

  if (images.length === 0) return { success: true as const };

  const { count } = await supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);

  const alreadyHasCover = (count ?? 0) > 0;

  const { error } = await supabase.from("product_images").insert(
    images.map((img, i) => ({
      product_id: productId,
      url: img.url,
      position: img.position,
      is_cover: !alreadyHasCover && i === 0 && img.position === 0,
    })),
  );

  if (error) return { error: "Erro ao salvar as imagens." };

  revalidatePath(`/meus-produtos/${productId}`);
  revalidatePath("/meus-produtos");
  return { success: true as const };
}

/** Remove uma imagem: apaga o registro e o arquivo no Storage. */
export async function deleteProductImage(imageId: string) {
  const ctx = await getOwnedStore();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, store } = ctx;

  const { data: image } = await supabase
    .from("product_images")
    .select("id, url, product_id, is_cover, products!inner(store_id)")
    .eq("id", imageId)
    .maybeSingle();

  const productStoreId = image
    ? (Array.isArray(image.products) ? image.products[0] : image.products)?.store_id
    : null;

  if (!image || productStoreId !== store.id) {
    return { error: "Imagem não encontrada." };
  }

  await supabase.from("product_images").delete().eq("id", imageId);

  // Storage: a policy de DELETE exige o 1º segmento = userId, mas o path é
  // {storeId}/{productId}/... — então removemos o arquivo via service role.
  const path = storagePathFromPublicUrl(image.url);
  if (path) {
    const admin = createAdminClient();
    await admin.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
  }

  // Se a capa foi removida, promove a próxima imagem.
  if (image.is_cover) {
    const { data: next } = await supabase
      .from("product_images")
      .select("id")
      .eq("product_id", image.product_id)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      await supabase
        .from("product_images")
        .update({ is_cover: true })
        .eq("id", next.id);
    }
  }

  revalidatePath(`/meus-produtos/${image.product_id}`);
  revalidatePath("/meus-produtos");
  return { success: true as const };
}

/** Reordena as imagens; a primeira da lista vira a capa. */
export async function reorderProductImages(
  productId: string,
  orderedIds: string[],
) {
  const ctx = await assertOwnsProduct(productId);
  if ("error" in ctx) return { error: ctx.error };
  const { supabase } = ctx;

  await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from("product_images")
        .update({ position: i, is_cover: i === 0 })
        .eq("id", id)
        .eq("product_id", productId),
    ),
  );

  revalidatePath(`/meus-produtos/${productId}`);
  revalidatePath("/meus-produtos");
  return { success: true as const };
}

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}
