"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { sendMessage, markAsRead } from "@/actions/messages";
import { Avatar } from "@/components/shared/Avatar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { cn, formatPrice } from "@/lib/utils";
import { PLACEHOLDER_PRODUCT_IMG } from "@/lib/constants";

export interface ThreadMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export interface ThreadProduct {
  name: string;
  slug: string;
  price: number;
  imageUrl: string | null;
}

interface MessageThreadProps {
  conversationId: string;
  messages: ThreadMessage[];
  currentUserId: string;
  otherName: string;
  otherAvatar: string | null;
  product: ThreadProduct | null;
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  if (sameDay(date, today)) return "Hoje";
  if (sameDay(date, yesterday)) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function groupByDay(messages: ThreadMessage[]) {
  const groups: { label: string; items: ThreadMessage[] }[] = [];
  for (const message of messages) {
    const label = dayLabel(message.createdAt);
    const group = groups.at(-1);
    if (group && group.label === label) group.items.push(message);
    else groups.push({ label, items: [message] });
  }
  return groups;
}

export function MessageThread({
  conversationId,
  messages,
  currentUserId,
  otherName,
  otherAvatar,
  product,
}: MessageThreadProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markAsRead(conversationId).then(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setDraft("");
    const result = await sendMessage(conversationId, content);
    setSending(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  };

  const groups = groupByDay(messages);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 p-4 border-b border-border dark:border-[#3d2c1a] flex-shrink-0">
        <Link
          href="/mensagens"
          className="md:hidden text-muted-foreground hover:text-terracota"
          aria-label="Voltar para a lista de conversas"
        >
          <ArrowLeft size={18} />
        </Link>
        <Avatar name={otherName} url={otherAvatar} size={36} />
        <p className="font-semibold text-dark dark:text-[#f5edd6] truncate">{otherName}</p>
      </header>

      {product && (
        <Link
          href={`/produtos/${product.slug}`}
          className="flex items-center gap-3 p-3 m-3 rounded-xl border border-border dark:border-[#3d2c1a] bg-cream/40 dark:bg-[#1f1509] hover:border-terracota/50 transition-colors flex-shrink-0"
        >
          <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-cream dark:bg-[#3d2c1a] flex-shrink-0">
            <Image
              src={product.imageUrl ?? PLACEHOLDER_PRODUCT_IMG}
              alt={product.name}
              fill
              className="object-cover"
              sizes="48px"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Produto
            </p>
            <p className="text-sm font-semibold text-dark dark:text-[#f5edd6] truncate">
              {product.name}
            </p>
            <p className="text-sm font-bold text-terracota">{formatPrice(product.price)}</p>
          </div>
        </Link>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {groups.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            Nenhuma mensagem ainda. Diga olá!
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div className="text-center text-xs text-muted-foreground my-3">{group.label}</div>
              <div className="flex flex-col gap-2 mb-2">
                {group.items.map((message) => {
                  const mine = message.senderId === currentUserId;
                  return (
                    <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                          mine
                            ? "bg-terracota text-white rounded-br-sm"
                            : "bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-bl-sm",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        <RelativeTime
                          date={message.createdAt}
                          className={cn(
                            "block text-[10px] mt-1",
                            mine ? "text-white/70" : "text-muted-foreground",
                          )}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 p-3 border-t border-border dark:border-[#3d2c1a] flex-shrink-0"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma mensagem..."
          className="flex-1 rounded-full border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] text-dark dark:text-[#f5edd6] px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracota"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="w-9 h-9 rounded-full bg-terracota text-white flex items-center justify-center hover:bg-terracota/90 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>
    </div>
  );
}
