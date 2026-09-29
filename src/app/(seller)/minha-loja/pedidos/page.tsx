import { redirect } from "next/navigation";
import { Package, Truck, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";
import { RelativeTime } from "@/components/shared/RelativeTime";
import {
  getSellerOrderStatus,
  SELLER_ORDER_STATUS_LABEL,
  SELLER_ORDER_STATUS_CLASS,
} from "@/lib/order-status";

export const dynamic = "force-dynamic";

interface SellerOrderItem {
  id: string;
  quantity: number;
  subtotal: number;
  itemStatus: string;
  productName: string;
}

interface SellerOrderShipment {
  serviceName: string | null;
  carrier: string;
  status: string;
  trackingCode: string | null;
  uberTrackingUrl: string | null;
}

interface SellerOrder {
  id: string;
  createdAt: string;
  buyerName: string;
  buyerCity: string | null;
  buyerState: string | null;
  items: SellerOrderItem[];
  shipment: SellerOrderShipment | null;
  netAmount: number;
}

/**
 * "Pedidos da loja" — a artesã não tinha onde ver os pedidos recebidos: o
 * link "Ver pedidos" do dashboard levava pra /pedidos, que mostra as COMPRAS
 * dela como compradora.
 *
 * orders só tem policy de SELECT para o comprador (auth.uid() = buyer_id) —
 * a artesã não lê a linha de orders pela própria sessão. Por instrução
 * explícita, não criamos policy nova em orders: a loja é confirmada com o
 * client comum (RLS), e a partir daí orders/order_items/shipments são lidos
 * com o client de admin, sempre filtrados por store_id = store.id — nunca
 * por um id vindo da URL. Só os campos abaixo saem da consulta; orders.notes,
 * orders.total_amount, itens de outras lojas e shipments.fulfillment_note
 * nunca são selecionados aqui.
 */
export default async function SellerOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, commission_rate")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!store) redirect("/minha-loja/nova");

  const admin = createAdminClient();

  const { data: items } = await admin
    .from("order_items")
    .select("id, order_id, quantity, subtotal, item_status, product:products(name)")
    .eq("store_id", store.id)
    .neq("item_status", "pending");

  const orderIds = [...new Set((items ?? []).map((i) => i.order_id))];

  const [{ data: orders }, { data: shipments }] = await Promise.all([
    orderIds.length > 0
      ? admin.from("orders").select("id, created_at, buyer_id, shipping_city, shipping_state").in("id", orderIds)
      : Promise.resolve({ data: [] as { id: string; created_at: string; buyer_id: string; shipping_city: string | null; shipping_state: string | null }[] }),
    orderIds.length > 0
      ? admin
          .from("shipments")
          .select("order_id, service_name, carrier, status, tracking_code, uber_tracking_url")
          .eq("store_id", store.id)
          .in("order_id", orderIds)
      : Promise.resolve({ data: [] as { order_id: string; service_name: string | null; carrier: string; status: string; tracking_code: string | null; uber_tracking_url: string | null }[] }),
  ]);

  const buyerIds = [...new Set((orders ?? []).map((o) => o.buyer_id))];
  const { data: buyers } =
    buyerIds.length > 0
      ? await admin.from("profiles").select("id, full_name").in("id", buyerIds)
      : { data: [] as { id: string; full_name: string }[] };

  const buyerNameById = new Map((buyers ?? []).map((b) => [b.id, b.full_name]));
  const shipmentByOrderId = new Map((shipments ?? []).map((s) => [s.order_id, s]));

  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));

  const grouped = new Map<string, SellerOrderItem[]>();
  for (const item of items ?? []) {
    const list = grouped.get(item.order_id) ?? [];
    const product = item.product as unknown as { name: string } | null;
    list.push({
      id: item.id,
      quantity: item.quantity,
      subtotal: item.subtotal,
      itemStatus: item.item_status,
      productName: product?.name ?? "Produto removido",
    });
    grouped.set(item.order_id, list);
  }

  const sellerOrders: SellerOrder[] = [...grouped.entries()]
    .map(([orderId, orderItems]) => {
      const order = orderById.get(orderId);
      const shipment = shipmentByOrderId.get(orderId);
      const grossAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
      return {
        id: orderId,
        createdAt: order?.created_at ?? new Date(0).toISOString(),
        buyerName: order ? (buyerNameById.get(order.buyer_id) ?? "Comprador") : "Comprador",
        buyerCity: order?.shipping_city ?? null,
        buyerState: order?.shipping_state ?? null,
        items: orderItems,
        shipment: shipment
          ? {
              serviceName: shipment.service_name,
              carrier: shipment.carrier,
              status: shipment.status,
              trackingCode: shipment.tracking_code,
              uberTrackingUrl: shipment.uber_tracking_url,
            }
          : null,
        netAmount: Math.round(grossAmount * (1 - store.commission_rate / 100) * 100) / 100,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">Pedidos da loja</h1>
        <p className="text-muted-foreground mt-1">Pedidos pagos de {store.name}, mais recentes primeiro.</p>
      </header>

      {sellerOrders.length === 0 ? (
        <div
          className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm py-16 px-6 text-center"
          style={{ borderRadius: "16px" }}
        >
          <div className="w-16 h-16 rounded-full bg-terracota/10 flex items-center justify-center mx-auto mb-4">
            <Package size={28} className="text-terracota" />
          </div>
          <p className="font-display text-xl font-bold text-dark dark:text-[#f5edd6]">
            Você ainda não tem pedidos pagos.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {sellerOrders.map((order) => {
            // Todos os itens da loja num mesmo pedido avançam juntos (mesmo
            // shipment) — usa o status do primeiro item como representativo.
            const status = getSellerOrderStatus(
              order.items[0]?.itemStatus ?? "confirmed",
              order.shipment?.status,
              order.shipment?.carrier,
            );

            return (
              <article
                key={order.id}
                className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm p-5"
                style={{ borderRadius: "16px" }}
              >
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-border dark:border-[#3d2c1a]">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Pedido #{order.id.slice(0, 8)} · <RelativeTime date={order.createdAt} />
                    </p>
                    <p className="text-sm font-semibold text-dark dark:text-[#f5edd6] mt-0.5">
                      {order.buyerName}
                      {order.buyerCity && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          · {order.buyerCity}/{order.buyerState}
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${SELLER_ORDER_STATUS_CLASS[status]}`}
                  >
                    {SELLER_ORDER_STATUS_LABEL[status]}
                  </span>
                </div>

                <ul className="flex flex-col gap-2 mt-3">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-dark dark:text-[#f5edd6]">
                        {item.quantity}× {item.productName}
                      </span>
                      <span className="font-semibold text-dark dark:text-[#f5edd6]">
                        {formatPrice(item.subtotal)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-border dark:border-[#3d2c1a] text-sm">
                  <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
                    <Truck size={14} className="text-terracota flex-shrink-0" />
                    <span className="truncate">
                      {order.shipment?.serviceName ?? "Frete a definir"}
                      {order.shipment?.trackingCode ? ` · ${order.shipment.trackingCode}` : ""}
                    </span>
                    {order.shipment?.uberTrackingUrl && (
                      <a
                        href={order.shipment.uberTrackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-terracota hover:underline flex-shrink-0"
                      >
                        Rastrear <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <span className="font-bold text-terracota whitespace-nowrap">
                    Você recebe {formatPrice(order.netAmount)}
                  </span>
                </div>

                {status === "etiqueta_gerada" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Imprima a etiqueta em melhorenvio.com.br, em Meus envios.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
