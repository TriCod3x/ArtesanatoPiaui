// Imagens de post da comunidade: validação no servidor e regras de compressão
// no navegador. Puro (sem I/O) pra ser testado com node --test.

export const MAX_POST_IMAGES = 6;
export const POST_IMAGES_BUCKET = "community-posts";
/** Teto do arquivo ORIGINAL escolhido pelo usuário, antes de comprimir. */
export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
export const COMPRESS_MAX_SIDE = 1600;
export const COMPRESS_JPEG_QUALITY = 0.8;
/** Teto do arquivo já comprimido, conferido no upload (server action). */
export const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;

const SAFE_FILE_NAME_RE = /^[A-Za-z0-9._-]{1,128}$/;

export type ImageUrlsResult = { ok: true; urls: string[] } | { ok: false; error: string };

/**
 * Convenção atual: bucket público `community-posts`, caminho
 * `<userId>/<arquivo>` (ver uploadPostImage). Uma URL só é aceita se for do
 * armazenamento DESTE projeto, dentro da pasta do próprio autor.
 */
export function validatePostImageUrls(
  urls: unknown,
  opts: { userId: string; supabaseUrl: string },
): ImageUrlsResult {
  if (urls === undefined || urls === null) return { ok: true, urls: [] };
  if (!Array.isArray(urls)) return { ok: false, error: "Imagens inválidas." };
  if (urls.length > MAX_POST_IMAGES) {
    return { ok: false, error: `Um post aceita no máximo ${MAX_POST_IMAGES} imagens.` };
  }

  let base: URL;
  try {
    base = new URL(opts.supabaseUrl);
  } catch {
    return { ok: false, error: "Armazenamento de imagens não configurado." };
  }
  const prefix = `/storage/v1/object/public/${POST_IMAGES_BUCKET}/${opts.userId}/`;

  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of urls) {
    if (typeof value !== "string" || value.length > 1024) {
      return { ok: false, error: "Imagem inválida." };
    }
    let u: URL;
    try {
      u = new URL(value);
    } catch {
      return { ok: false, error: "Imagem inválida." };
    }
    const fileName = u.pathname.startsWith(prefix) ? u.pathname.slice(prefix.length) : null;
    const ok =
      u.origin === base.origin &&
      u.protocol === "https:" &&
      u.username === "" &&
      u.password === "" &&
      u.search === "" &&
      u.hash === "" &&
      fileName !== null &&
      SAFE_FILE_NAME_RE.test(fileName) &&
      !fileName.includes("..");
    if (!ok) return { ok: false, error: "Imagem inválida: envie as imagens pelo formulário do post." };
    if (seen.has(u.href)) return { ok: false, error: "Imagem repetida." };
    seen.add(u.href);
    out.push(u.href);
  }
  return { ok: true, urls: out };
}

/** Erro ao escolher o arquivo (antes de comprimir), ou null. */
export function checkSourceImage(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith("image/")) return "O arquivo precisa ser uma imagem.";
  if (file.size > MAX_SOURCE_IMAGE_BYTES) return "Cada imagem deve ter no máximo 10MB.";
  return null;
}

/** Reduz mantendo a proporção até o lado maior caber em `max`; nunca amplia. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Escolhe a imagem a mostrar: linhas novas se houver; senão o image_url antigo. */
export function resolvePostImages(
  rows: { url: string; position: number }[] | null | undefined,
  legacyUrl: string | null | undefined,
): string[] {
  if (rows && rows.length > 0) {
    return [...rows].sort((a, b) => a.position - b.position).map((r) => r.url);
  }
  return legacyUrl ? [legacyUrl] : [];
}
