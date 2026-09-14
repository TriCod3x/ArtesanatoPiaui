import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Avatar } from "@/components/shared/Avatar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { MessageThread, type ThreadMessage, type ThreadProduct } from "@/components/messages/MessageThread";
import { getConversations } from "@/actions/messages";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/types";

export const dynamic = "force-dynamic";

interface SearchParams {
  conversa?: string;
}

interface ThreadData {
  otherName: string;
  otherAvatar: string | null;
  product: ThreadProduct | null;
  messages: ThreadMessage[];
}

async function getThreadData(
  conversationId: string,
  currentUserId: string,
): Promise<ThreadData | null> {
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      `
      id, buyer_id,
      store:stores(name, logo_url, owner_id),
      buyer:profiles!conversations_buyer_id_fkey(full_name, avatar_url),
      product:products(name, slug, price, images:product_images(url, is_cover, position))
      `,
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) return null;

  type StoreInfo = { name: string; logo_url: string | null; owner_id: string };
  type BuyerInfo = { full_name: string; avatar_url: string | null };
  type ProductInfo = {
    name: string;
    slug: string;
    price: number;
    images: { url: string; is_cover: boolean; position: number }[] | null;
  };

  const store = (Array.isArray(conversation.store) ? conversation.store[0] : conversation.store) as
    | StoreInfo
    | null;
  const buyer = (Array.isArray(conversation.buyer) ? conversation.buyer[0] : conversation.buyer) as
    | BuyerInfo
    | null;
  const product = (Array.isArray(conversation.product) ? conversation.product[0] : conversation.product) as
    | ProductInfo
    | null;

  const iAmBuyer = conversation.buyer_id === currentUserId;
  const isParticipant = iAmBuyer || store?.owner_id === currentUserId;
  if (!isParticipant) return null;

  const { data: messagesData } = await supabase
    .from("messages")
    .select("id, sender_id, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const images = [...(product?.images ?? [])].sort(
    (a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position,
  );

  return {
    otherName: iAmBuyer ? (store?.name ?? "Loja") : (buyer?.full_name ?? "Comprador"),
    otherAvatar: iAmBuyer ? (store?.logo_url ?? null) : (buyer?.avatar_url ?? null),
    product: product
      ? { name: product.name, slug: product.slug, price: product.price, imageUrl: images[0]?.url ?? null }
      : null,
    messages: (messagesData ?? []).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      content: m.content,
      createdAt: m.created_at,
    })),
  };
}

function ConversationListItem({ conversation, active }: { conversation: ConversationSummary; active: boolean }) {
  return (
    <Link
      href={`/mensagens?conversa=${conversation.id}`}
      className={cn(
        "flex items-center gap-3 p-3 border-b border-border/60 dark:border-[#3d2c1a]/60 hover:bg-cream dark:hover:bg-[#3d2c1a] transition-colors",
        active && "bg-cream dark:bg-[#3d2c1a]",
      )}
    >
      <Avatar name={conversation.otherName} url={conversation.otherAvatar} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm text-dark dark:text-[#f5edd6] truncate">
            {conversation.otherName}
          </p>
          {conversation.lastMessageAt && (
            <RelativeTime
              date={conversation.lastMessageAt}
              className="text-[11px] text-muted-foreground flex-shrink-0"
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">
            {conversation.lastMessage ?? "Diga olá!"}
          </p>
          {conversation.unreadCount > 0 && (
            <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-terracota text-white text-[10px] font-bold flex items-center justify-center">
              {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function MensagensPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { conversa } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/mensagens");

  const conversations = await getConversations();
  const thread = conversa ? await getThreadData(conversa, user.id) : null;

  return (
    <>
      <Header />
      <main className="flex-1 bg-cream/30 dark:bg-[#1a1208]">
        <div className="max-w-6xl mx-auto h-[calc(100vh-64px)] flex border-x border-border dark:border-[#3d2c1a]">
          {/* Lista de conversas */}
          <div
            className={cn(
              "w-full md:w-[340px] flex-shrink-0 border-r border-border dark:border-[#3d2c1a] bg-white dark:bg-[#110c05] overflow-y-auto",
              conversa ? "hidden md:block" : "block",
            )}
          >
            <div className="p-4 border-b border-border dark:border-[#3d2c1a]">
              <h1 className="font-display text-xl font-bold text-dark dark:text-[#f5edd6]">Mensagens</h1>
            </div>

            {conversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <MessageCircle size={28} className="mx-auto mb-3 text-muted-foreground/50" />
                Nenhuma conversa ainda.
              </div>
            ) : (
              conversations.map((c) => (
                <ConversationListItem key={c.id} conversation={c} active={c.id === conversa} />
              ))
            )}
          </div>

          {/* Thread */}
          <div className={cn("flex-1 min-w-0", conversa ? "flex" : "hidden md:flex")}>
            {thread ? (
              <MessageThread
                conversationId={conversa!}
                messages={thread.messages}
                currentUserId={user.id}
                otherName={thread.otherName}
                otherAvatar={thread.otherAvatar}
                product={thread.product}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-center px-6">
                <div>
                  <MessageCircle size={32} className="mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm">
                    {conversa ? "Conversa não encontrada." : "Selecione uma conversa para começar."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
