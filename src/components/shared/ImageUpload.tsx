"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, Star, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  MAX_PRODUCT_IMAGES,
  validateImageFile,
  uploadProductImageFile,
} from "@/lib/upload";
import {
  attachProductImages,
  deleteProductImage,
  reorderProductImages,
} from "@/actions/products";

export interface ExistingImage {
  id: string;
  url: string;
  position: number;
  is_cover: boolean;
}

interface PendingImage {
  key: string;
  file: File;
  preview: string;
}

export interface ImageUploadHandle {
  /** nº de imagens que ainda não foram enviadas (modo "novo produto"). */
  pendingCount: number;
  /** Envia as imagens pendentes para um produto recém-criado. */
  flush: (productId: string) => Promise<boolean>;
}

interface Props {
  storeId: string;
  /** Se informado, as imagens são enviadas na hora (edição de produto). */
  productId?: string;
  existing?: ExistingImage[];
  max?: number;
}

export const ImageUpload = forwardRef<ImageUploadHandle, Props>(function ImageUpload(
  { storeId, productId, existing = [], max = MAX_PRODUCT_IMAGES },
  ref,
) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [uploadingIds, setUploadingIds] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const sortedExisting = [...existing].sort((a, b) => a.position - b.position);
  const total = sortedExisting.length + pending.length + uploadingIds.length;
  const remaining = Math.max(0, max - total);

  const immediate = !!productId;

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const slots = max - sortedExisting.length - pending.length - uploadingIds.length;
      if (slots <= 0) {
        toast.error(`Máximo de ${max} imagens.`);
        return;
      }

      const valid: File[] = [];
      for (const f of list.slice(0, slots)) {
        const err = validateImageFile(f);
        if (err) toast.error(err);
        else valid.push(f);
      }
      if (list.length > slots) {
        toast.warning(`Só cabem mais ${slots} imagem(ns) — as demais foram ignoradas.`);
      }
      if (valid.length === 0) return;

      if (!immediate) {
        setPending((prev) => [
          ...prev,
          ...valid.map((file) => ({
            key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
            file,
            preview: URL.createObjectURL(file),
          })),
        ]);
        return;
      }

      // modo edição: sobe agora
      const startPos = sortedExisting.length;
      for (let i = 0; i < valid.length; i++) {
        const tmpId = `up-${Date.now()}-${i}`;
        setUploadingIds((p) => [...p, tmpId]);
        try {
          const url = await uploadProductImageFile(
            storeId,
            productId!,
            valid[i],
            startPos + i,
          );
          const res = await attachProductImages(productId!, [
            { url, position: startPos + i },
          ]);
          if (res.error) toast.error(res.error);
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Falha ao enviar a imagem.",
          );
        } finally {
          setUploadingIds((p) => p.filter((x) => x !== tmpId));
        }
      }
      router.refresh();
    },
    [immediate, max, pending.length, productId, router, sortedExisting.length, storeId, uploadingIds.length],
  );

  useImperativeHandle(
    ref,
    () => ({
      pendingCount: pending.length,
      flush: async (newProductId: string) => {
        if (pending.length === 0) return true;
        const urls: { url: string; position: number }[] = [];
        for (let i = 0; i < pending.length; i++) {
          try {
            const url = await uploadProductImageFile(
              storeId,
              newProductId,
              pending[i].file,
              i,
            );
            urls.push({ url, position: i });
          } catch (e) {
            toast.error(
              e instanceof Error
                ? `Erro ao enviar "${pending[i].file.name}": ${e.message}`
                : "Erro ao enviar uma imagem.",
            );
          }
        }
        if (urls.length === 0) return false;
        const res = await attachProductImages(newProductId, urls);
        if (res.error) {
          toast.error(res.error);
          return false;
        }
        return true;
      },
    }),
    [pending, storeId],
  );

  const removePending = (key: string) => {
    setPending((prev) => {
      const found = prev.find((p) => p.key === key);
      if (found) URL.revokeObjectURL(found.preview);
      return prev.filter((p) => p.key !== key);
    });
  };

  const removeExisting = async (id: string) => {
    const res = await deleteProductImage(id);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Imagem removida.");
      router.refresh();
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (immediate) {
      const ids = sortedExisting.map((i) => i.id);
      const j = index + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[index], ids[j]] = [ids[j], ids[index]];
      const res = await reorderProductImages(productId!, ids);
      if (res.error) toast.error(res.error);
      else router.refresh();
    } else {
      setPending((prev) => {
        const j = index + dir;
        if (j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        [next[index], next[j]] = [next[j], next[index]];
        return next;
      });
    }
  };

  const tiles: {
    key: string;
    url: string;
    isCover: boolean;
    loading?: boolean;
    onRemove?: () => void;
    canMove?: boolean;
  }[] = [
    ...sortedExisting.map((img, i) => ({
      key: img.id,
      url: img.url,
      isCover: img.is_cover || (i === 0 && !sortedExisting.some((x) => x.is_cover)),
      onRemove: () => removeExisting(img.id),
      canMove: true,
    })),
    ...pending.map((p, i) => ({
      key: p.key,
      url: p.preview,
      isCover: sortedExisting.length === 0 && i === 0,
      onRemove: () => removePending(p.key),
      canMove: true,
    })),
    ...uploadingIds.map((id) => ({
      key: id,
      url: "",
      isCover: false,
      loading: true,
    })),
  ];

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => remaining > 0 && inputRef.current?.click()}
        className={`rounded-xl border border-dashed p-6 text-center transition-colors ${
          remaining === 0
            ? "border-border dark:border-[#3d2c1a] opacity-60"
            : "cursor-pointer border-border dark:border-[#3d2c1a] hover:border-terracota/50"
        } ${dragOver ? "border-terracota bg-terracota/5" : ""}`}
      >
        <ImagePlus className="mx-auto mb-2 text-terracota" size={22} />
        <p className="text-sm text-dark dark:text-[#f5edd6]">
          {remaining === 0
            ? `Limite de ${max} imagens atingido`
            : "Arraste as fotos aqui ou clique para selecionar"}
        </p>
        <p className="text-xs text-muted-foreground dark:text-[#8a6a4a] mt-1">
          JPG, PNG ou WEBP · até 5MB · {remaining} restante(s)
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {tiles.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {tiles.map((tile, index) => (
            <div
              key={tile.key}
              className="group relative aspect-square rounded-xl overflow-hidden border border-border dark:border-[#3d2c1a] bg-cream dark:bg-[#1a1208]"
            >
              {tile.loading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="animate-spin text-terracota" size={20} />
                </div>
              ) : (
                <>
                  <Image src={tile.url} alt="" fill className="object-cover" sizes="120px" unoptimized={tile.url.startsWith("blob:")} />
                  {tile.isCover && (
                    <span className="absolute top-1 left-1 flex items-center gap-1 rounded-md bg-terracota px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      <Star size={10} /> Capa
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/45 px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex gap-0.5">
                      {tile.canMove && index > 0 && (
                        <button
                          type="button"
                          onClick={() => move(index, -1)}
                          className="text-white/90 hover:text-white"
                          aria-label="Mover para a esquerda"
                        >
                          <ChevronLeft size={14} />
                        </button>
                      )}
                      {tile.canMove && index < tiles.filter((t) => !t.loading).length - 1 && (
                        <button
                          type="button"
                          onClick={() => move(index, 1)}
                          className="text-white/90 hover:text-white"
                          aria-label="Mover para a direita"
                        >
                          <ChevronRight size={14} />
                        </button>
                      )}
                    </div>
                    {tile.onRemove && (
                      <button
                        type="button"
                        onClick={tile.onRemove}
                        className="text-white/90 hover:text-white"
                        aria-label="Remover imagem"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
