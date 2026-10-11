"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, Store, User, X } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { createPost, uploadPostImage, searchMentionables } from "@/actions/community";
import { postFormSchema, type PostFormInput } from "@/lib/validations";
import {
  MAX_MENTIONS,
  POST_TEXT_MAX,
  findMentionQuery,
  formatMentionToken,
  mentionsToPlainText,
  parseMentions,
  uniqueMentionTargets,
} from "@/lib/mentions";
import { MAX_POST_IMAGES } from "@/lib/post-images";
import { compressPostImage } from "@/lib/image-compress";
import { cn } from "@/lib/utils";
import type { MentionableResult } from "@/types/actions";
import type { PostAuthor } from "@/types";

interface CreatePostFormProps {
  author: PostAuthor;
  products?: { id: string; name: string }[];
}

interface DraftImage {
  id: string;
  file: File;
  preview: string;
}

const MENTION_DEBOUNCE_MS = 250;

export function CreatePostForm({ author, products = [] }: CreatePostFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [images, setImages] = useState<DraftImage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  // Autocomplete de marcações (@)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  // Resultado da última busca, guardado com a consulta que o gerou: resultado
  // de consulta antiga não aparece pra consulta nova.
  const [mentionData, setMentionData] = useState<{
    query: string;
    results: MentionableResult[];
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PostFormInput>({
    resolver: zodResolver(postFormSchema),
    defaultValues: { content: "", product_id: "" },
  });

  const contentField = register("content");
  const content = useWatch({ control, name: "content" }) ?? "";
  const visibleLength = mentionsToPlainText(content).length;
  const mentionsUsed = uniqueMentionTargets(parseMentions(content).tokens).length;

  // Libera as URLs de pré-visualização ao sair.
  const imagesRef = useRef<DraftImage[]>([]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  }, []);

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    // Zera o input: escolher o mesmo arquivo de novo dispara onChange.
    setInputKey((k) => k + 1);
    if (selected.length === 0) return;

    const room = MAX_POST_IMAGES - images.length;
    if (room <= 0) {
      toast.error(`Um post aceita no máximo ${MAX_POST_IMAGES} imagens.`);
      return;
    }
    const batch = selected.slice(0, room);
    if (selected.length > room) {
      toast.error(`Só cabem mais ${room} imagem(ns); as demais foram ignoradas.`);
    }

    setProcessing(true);
    const added: DraftImage[] = [];
    for (const file of batch) {
      try {
        const compressed = await compressPostImage(file);
        added.push({
          id: crypto.randomUUID(),
          file: compressed,
          preview: URL.createObjectURL(compressed),
        });
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "imagem inválida."}`);
      }
    }
    setProcessing(false);
    if (added.length > 0) setImages((prev) => [...prev, ...added].slice(0, MAX_POST_IMAGES));
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearImages = () => {
    images.forEach((i) => URL.revokeObjectURL(i.preview));
    setImages([]);
  };

  // --- Marcações (@) ---------------------------------------------------------

  const closeMentions = useCallback(() => {
    setMentionQuery(null);
    setMentionData(null);
    setActiveIndex(0);
  }, []);

  const refreshMentionQuery = (el: HTMLTextAreaElement) => {
    const found = findMentionQuery(el.value, el.selectionStart ?? el.value.length);
    const used = uniqueMentionTargets(parseMentions(el.value).tokens).length;
    if (!found || used >= MAX_MENTIONS) {
      closeMentions();
      return;
    }
    setMentionQuery((prev) => {
      if (prev !== found.query) setActiveIndex(0);
      return found.query;
    });
  };

  // Debounce de 250 ms; o servidor exige login e 2+ caracteres.
  useEffect(() => {
    if (mentionQuery === null || mentionQuery.length < 2) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await searchMentionables(mentionQuery);
      if (cancelled) return;
      setMentionData({ query: mentionQuery, results: "results" in res ? res.results : [] });
    }, MENTION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mentionQuery]);

  const showMentionList = mentionQuery !== null && mentionQuery.length >= 2;
  const mentionResults = mentionData?.query === mentionQuery ? mentionData.results : [];
  const mentionLoading = showMentionList && mentionData?.query !== mentionQuery;

  const pickMention = (item: MentionableResult) => {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const found = findMentionQuery(el.value, caret);
    if (!found) return;

    const token = formatMentionToken(item.nome, item.tipo, item.id);
    const next = `${el.value.slice(0, found.start)}${token} ${el.value.slice(caret)}`;
    setValue("content", next, { shouldDirty: true });
    closeMentions();

    const position = found.start + token.length + 1;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(position, position);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery === null || mentionResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % mentionResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + mentionResults.length) % mentionResults.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pickMention(mentionResults[activeIndex] ?? mentionResults[0]);
    } else if (e.key === "Escape") {
      closeMentions();
    }
  };

  // --- Envio -----------------------------------------------------------------

  const onSubmit = async (values: PostFormInput) => {
    const urls: string[] = [];

    // Um upload por imagem (já comprimida). Falhou um, aborta antes de criar o post.
    for (const image of images) {
      const formData = new FormData();
      formData.append("file", image.file);
      const upload = await uploadPostImage(formData);
      if (upload.error || !upload.url) {
        toast.error(upload.error ?? "Erro ao fazer upload da imagem.");
        return;
      }
      urls.push(upload.url);
    }

    const result = await createPost(values.content, urls, values.product_id || undefined);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    reset({ content: "", product_id: "" });
    clearImages();
    closeMentions();
    toast.success("Post publicado!");
    router.refresh();
  };

  const busy = isSubmitting || processing;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      autoComplete="off"
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
          <div className="relative">
            <Textarea
              {...contentField}
              ref={(el) => {
                contentField.ref(el);
                textareaRef.current = el;
              }}
              onChange={(e) => {
                contentField.onChange(e);
                refreshMentionQuery(e.target);
              }}
              onKeyDown={handleKeyDown}
              onKeyUp={(e) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                  refreshMentionQuery(e.currentTarget);
                }
              }}
              onClick={(e) => refreshMentionQuery(e.currentTarget)}
              onBlur={(e) => {
                contentField.onBlur(e);
                // Dá tempo do clique numa sugestão (onMouseDown) acontecer antes.
                setTimeout(closeMentions, 150);
              }}
              rows={3}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              placeholder="Compartilhe uma nova peça, um bastidor do seu trabalho... Use @ para marcar alguém ou uma loja."
              className="resize-none border-0 bg-transparent px-0 text-[15px] focus-visible:ring-0 text-dark dark:text-[#f5edd6]"
            />

            {showMentionList && (
              <ul
                role="listbox"
                aria-label="Sugestões de marcação"
                className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] shadow-lg py-1"
              >
                {mentionLoading && mentionResults.length === 0 && (
                  <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" /> Buscando...
                  </li>
                )}
                {!mentionLoading && mentionResults.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">Ninguém encontrado.</li>
                )}
                {mentionResults.map((item, index) => (
                  <li key={`${item.tipo}:${item.id}`} role="option" aria-selected={index === activeIndex}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickMention(item);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-left cursor-pointer",
                        index === activeIndex && "bg-terracota/10"
                      )}
                    >
                      <span className="relative w-8 h-8 rounded-full overflow-hidden bg-cream dark:bg-[#3d2c1a] flex items-center justify-center flex-shrink-0">
                        {item.avatar ? (
                          <Image src={item.avatar} alt="" fill className="object-cover" sizes="32px" />
                        ) : item.tipo === "store" ? (
                          <Store size={14} className="text-terracota" />
                        ) : (
                          <User size={14} className="text-terracota" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-medium text-dark dark:text-[#f5edd6] truncate">
                        {item.nome}
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                        {item.tipo === "store" ? "Loja" : "Pessoa"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {mentionsUsed > 0 && `${mentionsUsed}/${MAX_MENTIONS} marcações`}
            </span>
            <span className={cn(visibleLength > POST_TEXT_MAX && "text-red-500")}>
              {visibleLength}/{POST_TEXT_MAX}
            </span>
          </div>

          {errors.content && (
            <p className="text-sm text-red-500 mt-1">{errors.content.message}</p>
          )}

          {images.length > 0 && (
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {images.map((image, index) => (
                <li
                  key={image.id}
                  className="relative aspect-square rounded-xl overflow-hidden border border-border dark:border-[#3d2c1a] bg-cream dark:bg-[#3d2c1a]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.preview}
                    alt={`Pré-visualização ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(image.id)}
                    disabled={busy}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-dark/70 text-white flex items-center justify-center hover:bg-dark transition-colors cursor-pointer disabled:opacity-50"
                    aria-label={`Remover imagem ${index + 1}`}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
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
              multiple
              onChange={handleFilesChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || images.length >= MAX_POST_IMAGES}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-terracota transition-colors px-2 py-1.5 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
              <span>{processing ? "Preparando..." : "Adicionar imagens"}</span>
              <span className="text-xs text-muted-foreground">
                {images.length}/{MAX_POST_IMAGES}
              </span>
            </button>

            <button
              type="submit"
              disabled={busy}
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
