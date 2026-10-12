"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Ban, Flag, Loader2, MoreVertical, Send, ShieldAlert } from "lucide-react";
import { sendMessage, markConversationRead, blockUser, unblockUser } from "@/actions/messages";
import { createClient } from "@/lib/supabase/client";
import { MESSAGE_MAX_LENGTH, mergeMessages, type ChatMessage } from "@/lib/chat";
import { Avatar } from "@/components/shared/Avatar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { MessageText } from "@/components/messages/MessageText";
import { ReportDialog } from "@/components/messages/ReportDialog";
import { cn, formatPrice } from "@/lib/utils";
import { PLACEHOLDER_PRODUCT_IMG } from "@/lib/constants";

export type ThreadMessage = ChatMessage;

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
  /** Eu bloqueei o outro lado: o campo de envio fica desativado. */
  blockedByMe: boolean;
  /** Aviso pra LOJA: comprador sem pedido pago nela. */
  warnUnknownBuyer: boolean;
  /** Ex.: "#1a2b3c4d" quando a conversa nasceu de um pedido. */
  orderLabel: string | null;
}

/** Sem Realtime (conexão caída), busca de novo a cada 30 s. */
const FALLBACK_POLL_MS = 30_000;

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

interface MessageRow {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

const fromRow = (row: MessageRow): ThreadMessage => ({
  id: row.id,
  senderId: row.sender_id,
  content: row.content,
  createdAt: row.created_at,
});

export function MessageThread({
  conversationId,
  messages: serverMessages,
  currentUserId,
  otherName,
  otherAvatar,
  product,
  blockedByMe,
  warnUnknownBuyer,
  orderLabel,
}: MessageThreadProps) {
  const router = useRouter();
  // Mensagens que chegaram por Realtime/busca; a lista exibida é a do servidor
  // (props, atualizada por router.refresh) juntada com estas, sem duplicar.
  const [liveMessages, setLiveMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockedOverride, setBlockedOverride] = useState<boolean | null>(null);
  const blocked = blockedOverride ?? blockedByMe;
  const [unblocking, setUnblocking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const connectedRef = useRef(false);

  const messages = useMemo(
    () => mergeMessages(serverMessages, liveMessages),
    [serverMessages, liveMessages],
  );

  // Realtime das mensagens desta conversa (a RLS filtra o que o usuário vê),
  // com busca periódica só enquanto a conexão estiver fora.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setLiveMessages((prev) => mergeMessages(prev, [fromRow(payload.new as MessageRow)]));
        },
      )
      .subscribe((status) => {
        connectedRef.current = status === "SUBSCRIBED";
      });

    const poll = setInterval(async () => {
      if (connectedRef.current) return;
      const { data } = await supabase
        .from("messages")
        .select("id, sender_id, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) setLiveMessages((prev) => mergeMessages(prev, data.map(fromRow)));
    }, FALLBACK_POLL_MS);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Marca como lida ao abrir e a cada mensagem nova do outro lado enquanto aberta.
  const lastIncomingId = messages.findLast((m) => m.senderId !== currentUserId)?.id ?? null;
  useEffect(() => {
    markConversationRead(conversationId).then(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, lastIncomingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    const result = await sendMessage(conversationId, content);
    setSending(false);

    if ("error" in result) {
      if (result.unauthenticated) {
        router.push("/login");
        return;
      }
      toast.error(result.error);
      return;
    }
    setDraft("");
    router.refresh();
  };

  const handleBlock = async () => {
    const result = await blockUser(conversationId);
    if ("error" in result) {
      toast.error(result.error);
      return result;
    }
    setBlockedOverride(true);
    toast.success("Contato bloqueado.");
    router.refresh();
  };

  const handleUnblock = async () => {
    setUnblocking(true);
    const result = await unblockUser(conversationId);
    setUnblocking(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setBlockedOverride(false);
    toast.success("Contato desbloqueado.");
    router.refresh();
  };

  const groups = groupByDay(messages);

  return (
    <div className="flex flex-col h-full w-full">
      <header className="flex items-center gap-3 p-4 border-b border-border dark:border-[#3d2c1a] flex-shrink-0">
        <Link
          href="/mensagens"
          className="md:hidden text-muted-foreground hover:text-terracota"
          aria-label="Voltar para a lista de conversas"
        >
          <ArrowLeft size={18} />
        </Link>
        <Avatar name={otherName} url={otherAvatar} size={36} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-dark dark:text-[#f5edd6] truncate">{otherName}</p>
          {orderLabel && (
            <p className="text-xs text-muted-foreground truncate">Sobre o pedido {orderLabel}</p>
          )}
        </div>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Mais opções da conversa"
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-cream dark:hover:bg-[#3d2c1a] transition-colors cursor-pointer"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1 w-44 rounded-xl border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] shadow-lg py-1.5 z-20"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-dark dark:text-[#f5edd6] hover:bg-cream dark:hover:bg-[#3d2c1a] cursor-pointer"
              >
                <Flag size={15} className="text-terracota" />
                Denunciar
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  if (blocked) handleUnblock();
                  else setBlockOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-dark dark:text-[#f5edd6] hover:bg-cream dark:hover:bg-[#3d2c1a] cursor-pointer"
              >
                <Ban size={15} className="text-terracota" />
                {blocked ? "Desbloquear" : "Bloquear"}
              </button>
            </div>
          )}
        </div>
      </header>

      {warnUnknownBuyer && !blocked && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 bg-amber/10 border-b border-amber/30 flex-shrink-0">
          <ShieldAlert size={16} className="text-amber flex-shrink-0" />
          <p className="text-sm text-dark dark:text-[#f5edd6] flex-1 min-w-[200px]">
            Este comprador ainda não comprou na sua loja.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="text-xs font-semibold text-terracota hover:underline cursor-pointer"
            >
              Denunciar
            </button>
            <button
              type="button"
              onClick={() => setBlockOpen(true)}
              className="text-xs font-semibold text-terracota hover:underline cursor-pointer"
            >
              Bloquear
            </button>
          </div>
        </div>
      )}

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
                        <MessageText content={message.content} className="break-words" />
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

      {blocked ? (
        <div className="flex items-center justify-between gap-3 p-3 border-t border-border dark:border-[#3d2c1a] flex-shrink-0">
          <p className="text-sm text-muted-foreground">Você bloqueou este contato</p>
          <button
            type="button"
            onClick={handleUnblock}
            disabled={unblocking}
            className="px-4 py-1.5 rounded-full border border-terracota text-terracota text-sm font-semibold hover:bg-terracota hover:text-white transition-colors disabled:opacity-60 cursor-pointer"
          >
            {unblocking ? <Loader2 size={14} className="animate-spin" /> : "Desbloquear"}
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 p-3 border-t border-border dark:border-[#3d2c1a] flex-shrink-0"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder="Escreva uma mensagem..."
            className="flex-1 rounded-full border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] text-dark dark:text-[#f5edd6] px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracota"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Enviar mensagem"
            className="w-9 h-9 rounded-full bg-terracota text-white flex items-center justify-center hover:bg-terracota/90 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </form>
      )}

      <ReportDialog
        conversationId={conversationId}
        open={reportOpen}
        onOpenChange={setReportOpen}
        alreadyBlocked={blocked}
        onReported={(didBlock) => {
          if (didBlock) setBlockedOverride(true);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title={`Bloquear ${otherName}?`}
        description="Vocês não poderão trocar mensagens enquanto o bloqueio durar. Você pode desbloquear quando quiser."
        confirmLabel="Bloquear"
        destructive
        onConfirm={handleBlock}
      />
    </div>
  );
}
