"use server";

// Histórico de pedidos na aba "Pedidos" do carrinho e "Pedir de novo".
// Só leitura: nenhuma destas actions cria pedido nem toca em pagamento/frete.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUYER_ORDERS_SELECT, type BuyerOrderRow } from "@/lib/buyer-orders";
import { isUuid } from "@/lib/mentions";
import { computeReorder, type ReorderProduct } from "@/lib/reorder";
import type { ProductWithRelations } from "@/types";
import type {
  BuyerOrderHistoryResult,
  BuyerOrderSummary,
  ReorderItemsResult,
} from "@/types/actions";

const AUTH_ERROR = "Você precisa estar logado.";
const PAGE_SIZE = 10;
const PREVIEW_ITEMS = 3;

export async function getBuyerOrderHistory(offset = 0): Promise<BuyerOrderHistoryResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR, unauthenticated: true };

  const from = Number.isInteger(offset) && offset > 0 ? Math.min(offset, 10_000) : 0;

  // Pede uma linha a mais pra saber se há próxima página.
  const { data, error } = await supabase
    .from("orders")
    .select(BUYER_ORDERS_SELECT)
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE);

  if (error) return { error: "Erro ao carregar seus pedidos." };

  const rows = (data ?? []) as unknown as BuyerOrderRow[];
  const hasMore = rows.length > PAGE_SIZE;

  const orders: BuyerOrderSummary[] = rows.slice(0, PAGE_SIZE).map((order) => {
    const items = order.items ?? [];
    const storeNames = [
      ...new Set(
        (order.shipments ?? []).map((s) => s.store?.name).filter((n): n is string => !!n),
      ),
    ];
    return {
      id: order.id,
      createdAt: order.created_at,
      status: order.status,
      totalAmount: order.total_amount,
      storeNames,
      itemCount: items.length,
      previewItems: items.slice(0, PREVIEW_ITEMS).map((item) => ({
        name: item.product?.name ?? "Produto removido",
        imageUrl:
          item.product?.images?.find((i) => i.is_cover)?.url ??
          item.product?.images?.[0]?.url ??
          null,
      })),
      extraItems: Math.max(0, items.length - PREVIEW_ITEMS),
    };
  });

  return { orders, hasMore };
}

interface ReorderOrderRow {
  id: string;
  items: { product_id: string | null; quantity: number }[] | null;
}

export async function getReorderItems(orderId: string): Promise<ReorderItemsResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERROR, unauthenticated: true };
  if (typeof orderId !== "string" || !isUuid(orderId)) return { error: "Pedido não encontrado." };

  // Só o pedido do próprio usuário: o filtro buyer_id fica aqui, sem depender
  // só da RLS.
  const { data: orderData } = await supabase
    .from("orders")
    .select("id, items:order_items(product_id, quantity)")
    .eq("id", orderId)
    .eq("buyer_id", user.id)
    .maybeSingle();

  const order = orderData as unknown as ReorderOrderRow | null;
  if (!order) return { error: "Pedido não encontrado." };

  const items = order.items ?? [];
  const productIds = [...new Set(items.map((i) => i.product_id).filter((id): id is string => !!id))];

  // Estado ATUAL dos produtos. Cliente admin porque a RLS esconde produto/loja
  // inativos do comprador e a gente precisa do nome pra dizer o que ficou de
  // fora; só lê ids de um pedido que o usuário comprovadamente fez, e só
  // devolve produto completo pros que estão ativos (já públicos).
  const products = new Map<string, ReorderProduct>();
  const fullProducts = new Map<string, ProductWithRelations>();

  if (productIds.length > 0) {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("products")
      .select("*, store:stores(*), images:product_images(*)")
      .in("id", productIds);

    if (error) return { error: "Erro ao conferir os produtos do pedido." };

    for (const row of (rows ?? []) as unknown as ProductWithRelations[]) {
      products.set(row.id, {
        id: row.id,
        name: row.name,
        price: row.price,
        stock: row.stock,
        status: row.status,
        storeStatus: row.store?.status ?? null,
      });
      fullProducts.set(row.id, row);
    }
  }

  const plan = computeReorder(items, products);

  return {
    items: plan.available.flatMap((a) => {
      const product = fullProducts.get(a.productId);
      if (!product) return [];
      return [
        {
          // Preço atual: vem do produto, nunca do pedido antigo.
          product,
          quantity: a.quantity,
          requestedQuantity: a.requestedQuantity,
        },
      ];
    }),
    unavailable: plan.unavailable.map((u) => ({ name: u.name, reason: u.reason })),
  };
}
