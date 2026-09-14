"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageCircle } from "lucide-react";
import { getOrCreateConversation } from "@/actions/messages";
import { cn } from "@/lib/utils";

interface SendMessageButtonProps {
  storeId: string;
  productId?: string;
  variant?: "pill" | "block";
  className?: string;
}

export function SendMessageButton({
  storeId,
  productId,
  variant = "pill",
  className,
}: SendMessageButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const result = await getOrCreateConversation(storeId, productId);
    setLoading(false);

    if ("error" in result) {
      if (result.error === "unauthenticated") {
        router.push("/login");
        return;
      }
      toast.error(result.error);
      return;
    }

    router.push(`/mensagens?conversa=${result.conversationId}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        "flex items-center justify-center gap-2 font-semibold transition-opacity hover:opacity-90 disabled:opacity-60",
        variant === "pill"
          ? "px-5 py-2.5 rounded-full text-sm text-white bg-terracota"
          : "w-full h-12 rounded-lg text-base border border-terracota text-terracota hover:bg-terracota hover:text-white",
        className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
      Enviar mensagem
    </button>
  );
}
