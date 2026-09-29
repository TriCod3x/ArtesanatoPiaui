"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { createReview } from "@/actions/reviews";
import { cn } from "@/lib/utils";

export function ReviewForm({ orderItemId, productName }: { orderItemId: string; productName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return <p className="text-xs text-capim font-medium mt-1">Avaliação enviada. Obrigado!</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-terracota hover:underline mt-1"
      >
        Avaliar produto
      </button>
    );
  }

  function handleSubmit() {
    if (rating === 0) {
      toast.error("Escolha uma nota de 1 a 5 estrelas.");
      return;
    }
    startTransition(async () => {
      const result = await createReview(orderItemId, { rating, comment });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setDone(true);
      toast.success(`Avaliação de "${productName}" enviada.`);
      router.refresh();
    });
  }

  return (
    <div className="mt-2 p-3 rounded-lg border border-border dark:border-[#3d2c1a] bg-cream/50 dark:bg-[#3d2c1a]/40">
      <p className="text-xs font-semibold text-dark dark:text-[#f5edd6] mb-1.5">Avaliar {productName}</p>
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
          >
            <Star
              size={20}
              className={cn(
                (hoverRating || rating) >= star ? "fill-amber text-amber" : "text-muted-foreground",
              )}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Comentário (opcional)"
        className="w-full text-sm rounded-md border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] px-2.5 py-1.5 text-dark dark:text-[#f5edd6]"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="text-xs font-semibold bg-terracota hover:bg-terracota/90 text-white px-3 py-1.5 rounded-full disabled:opacity-60"
        >
          {isPending ? "Enviando..." : "Enviar avaliação"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
