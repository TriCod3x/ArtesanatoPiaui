import { createClient } from "@/lib/supabase/client";

export const PRODUCT_IMAGES_BUCKET = "product-images";
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_PRODUCT_IMAGES = 5;

/** Retorna uma mensagem de erro se o arquivo não for uma imagem válida. */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}": formato inválido. Use JPG, PNG ou WEBP.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `"${file.name}": maior que 5MB.`;
  }
  return null;
}

/**
 * Sobe uma imagem direto para o bucket `product-images` no path
 * `{storeId}/{productId}/{timestamp}-{index}.{ext}` e devolve a URL pública.
 */
export async function uploadProductImageFile(
  storeId: string,
  productId: string,
  file: File,
  index: number,
): Promise<string> {
  const supabase = createClient();
  const ext =
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type] ??
    file.name.split(".").pop()?.toLowerCase() ??
    "jpg";
  const path = `${storeId}/${productId}/${Date.now()}-${index}.${ext}`;

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
