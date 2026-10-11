// Compressão de imagem no navegador (canvas, sem biblioteca): lado maior em
// 1600 px, JPEG qualidade 0.8. Só roda no cliente.

import {
  COMPRESS_JPEG_QUALITY,
  COMPRESS_MAX_SIDE,
  checkSourceImage,
  fitWithin,
} from "@/lib/post-images";

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // cai pro <img> abaixo
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Não foi possível ler essa imagem.");
  }
}

/** Recusa o que não é imagem ou passa de 10 MB ANTES de comprimir. */
export async function compressPostImage(file: File): Promise<File> {
  const sourceError = checkSourceImage(file);
  if (sourceError) throw new Error(sourceError);

  const decoded = await decode(file);
  try {
    if (decoded.width < 1 || decoded.height < 1) throw new Error("Imagem inválida.");
    const { width, height } = fitWithin(decoded.width, decoded.height, COMPRESS_MAX_SIDE);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível processar a imagem.");

    // JPEG não tem transparência: fundo branco em vez de preto.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.source, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", COMPRESS_JPEG_QUALITY),
    );
    if (!blob) throw new Error("Não foi possível comprimir a imagem.");

    const base = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "imagem";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    decoded.close();
  }
}
