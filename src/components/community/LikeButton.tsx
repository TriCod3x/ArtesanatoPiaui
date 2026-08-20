"use client";

import { useEffect, useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { toggleProductLike, toggleStoreLike } from "@/actions/community";
import { cn } from "@/lib/utils";

type Target = "product" | "store";
type Variant = "floating" | "pill" | "inline";

interface LikeButtonProps {
  targetId: string;
  target: Target;
  variant?: Variant;
  label?: string;
  className?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  floating:
    "absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 dark:bg-[#2a1e0f]/90 shadow-sm hover:bg-white dark:hover:bg-[#2a1e0f] text-dark dark:text-[#f5edd6]",
  pill:
    "gap-2 px-5 py-2.5 rounded-full border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] text-sm font-semibold text-dark dark:text-[#f5edd6] hover:border-terracota/50",
  inline:
    "gap-2 text-sm text-muted-foreground hover:text-terracota px-2 py-1 rounded-lg",
};

export function LikeButton({
  targetId,
  target,
  variant = "floating",
  label,
  className,
}: LikeButtonProps) {
  const [liked, setLiked] = useState(false);
  const [bump, setBump] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq(target === "product" ? "product_id" : "store_id", targetId)
        .maybeSingle();

      if (active) setLiked(!!data);
    };

    load();
    return () => {
      active = false;
    };
  }, [targetId, target]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Estado otimista: atualiza antes de confirmar no servidor
    const previous = liked;
    setLiked(!previous);
    setBump(true);

    startTransition(async () => {
      const result =
        target === "product"
          ? await toggleProductLike(targetId)
          : await toggleStoreLike(targetId);

      if (result.error) {
        setLiked(previous);
        toast.error(result.error);
        return;
      }

      setLiked(!!result.liked);
      if (result.liked) {
        toast.success(target === "product" ? "Produto favoritado!" : "Loja favoritada!");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={liked}
      aria-label={liked ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      className={cn(
        "flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-90",
        VARIANT_CLASSES[variant],
        liked && variant !== "floating" && "text-terracota border-terracota/50",
        className
      )}
    >
      <Heart
        size={variant === "floating" ? 14 : 16}
        fill={liked ? "#C4622D" : "none"}
        className={cn(
          "transition-colors duration-200",
          liked ? "text-terracota" : "",
          bump && "heart-pop"
        )}
        onAnimationEnd={() => setBump(false)}
      />
      {label && <span>{liked ? "Favoritado" : label}</span>}
    </button>
  );
}
