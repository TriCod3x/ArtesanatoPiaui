"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { createPost, uploadPostImage } from "@/actions/community";
import { postSchema, type PostInput } from "@/lib/validations";
import type { PostAuthor } from "@/types";

interface CreatePostFormProps {
  author: PostAuthor;
  products?: { id: string; name: string }[];
}

export function CreatePostForm({ author, products = [] }: CreatePostFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PostInput>({
    resolver: zodResolver(postSchema),
    defaultValues: { content: "", product_id: "" },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.type.startsWith("image/")) {
      toast.error("O arquivo precisa ser uma imagem.");
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB.");
      return;
    }

    setFile(selected);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(selected);
    });
  };

  const clearImage = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setInputKey((k) => k + 1);
  };

  const onSubmit = async (values: PostInput) => {
    let imageUrl: string | undefined;

    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      const upload = await uploadPostImage(formData);
      if (upload.error) {
        toast.error(upload.error);
        return;
      }
      imageUrl = upload.url;
    }

    const result = await createPost(values.content, imageUrl, values.product_id || undefined);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    reset({ content: "", product_id: "" });
    clearImage();
    toast.success("Post publicado!");
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm p-4 mb-8"
      style={{ borderRadius: "16px" }}
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-cream dark:bg-[#3d2c1a] flex items-center justify-center flex-shrink-0 relative">
          {author.avatar_url ? (
            <Image src={author.avatar_url} alt={author.full_name} fill className="object-cover" sizes="40px" />
          ) : (
            <span className="font-bold text-terracota">
              {author.full_name?.[0]?.toUpperCase() ?? "A"}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <Textarea
            {...register("content")}
            rows={3}
            maxLength={1000}
            placeholder="Compartilhe uma nova peça, um bastidor do seu trabalho..."
            className="resize-none border-0 bg-transparent px-0 text-[15px] focus-visible:ring-0 text-dark dark:text-[#f5edd6]"
          />
          {errors.content && (
            <p className="text-sm text-red-500 mt-1">{errors.content.message}</p>
          )}

          {preview && (
            <div className="relative mt-3 rounded-xl overflow-hidden border border-border dark:border-[#3d2c1a]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Pré-visualização"
                className="w-full h-auto object-contain"
                style={{ maxHeight: "320px" }}
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-dark/70 text-white flex items-center justify-center hover:bg-dark transition-colors cursor-pointer"
                aria-label="Remover imagem"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {products.length > 0 && (
            <div className="mt-3">
              <label
                htmlFor="post-product"
                className="text-xs font-semibold text-muted-foreground block mb-1"
              >
                Vincular a um produto
              </label>
              <select
                id="post-product"
                {...register("product_id")}
                className="w-full rounded-lg border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] text-dark dark:text-[#f5edd6] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracota"
              >
                <option value="">Nenhum produto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border dark:border-[#3d2c1a]">
            <input
              key={inputKey}
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-terracota transition-colors px-2 py-1.5 rounded-lg cursor-pointer"
            >
              <ImagePlus size={18} />
              <span>{file ? "Trocar imagem" : "Adicionar imagem"}</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-terracota hover:bg-terracota/90 text-white font-semibold text-sm px-6 py-2 rounded-full transition-colors disabled:opacity-60 cursor-pointer flex items-center gap-2"
            >
              {isSubmitting && <Loader2 size={15} className="animate-spin" />}
              {isSubmitting ? "Publicando..." : "Publicar"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
