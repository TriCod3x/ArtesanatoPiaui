import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Package, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { formatPrice } from "@/lib/utils";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { PLACEHOLDER_PRODUCT_IMG } from "@/lib/constants";
import { getBuyerOrderStatus, getBuyerOrderStatusLabel, BUYER_ORDER_STATUS_CLASS } from "@/lib/order-status";
import { ReviewForm } from "@/components/orders/ReviewForm";
import { SendMessageButton } from "@/components/messages/SendMessageButton";
import { BUYER_ORDERS_SELECT, type BuyerOrderRow } from "@/lib/buyer-orders";

export const dynamic = "force-dynamic";

/** Lojas distintas de um pedido, na ordem em que aparecem nos itens. */
function storesOfOrder(order: BuyerOrderRow): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const item of order.items) {
    if (!seen.has(item.store_id)) seen.set(item.store_id, item.store?.name ?? "a loja");
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

export default async function PedidosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/pedidos");

  const { data } = await supabase
    .from("orders")
    .select(BUYER_ORDERS_SELECT)
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as unknown as BuyerOrderRow[];

  const deliveredItemIds = orders
    .flatMap((o) => o.items)
    .filter((i) => i.item_status === "delivered")
    .map((i) => i.id);

  const { data: existingReviews } =
    deliveredItemIds.length > 0
      ? await supabase.from("reviews").select("order_item_id").in("order_item_id", deliveredItemIds)
      : { data: [] as { order_item_id: string | null }[] };

  const reviewedItemIds = new Set((existingReviews ?? []).map((r) => r.order_item_id));

  return (
    <>
      <Header />
      <main className="flex-1 bg-background">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <header className="mb-8">
            <h1 className="font-display text-4xl font-bold text-dark dark:text-[#f5edd6]">
              Meus pedidos
            </h1>
            <p className="text-muted-foreground mt-1">
              Acompanhe o status das suas compras no marketplace.
            </p>
          </header>

          {orders.length === 0 ? (
            <div
              className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm py-16 px-6 text-center"
              style={{ borderRadius: "16px" }}
            >
              <div className="w-16 h-16 rounded-full bg-terracota/10 flex items-center justify-center mx-auto mb-4">
                <Package size={28} className="text-terracota" />
              </div>
              <p className="font-display text-xl font-bold text-dark dark:text-[#f5edd6]">
                Você ainda não fez nenhum pedido
              </p>
              <p className="text-sm text-muted-foreground mt-2 mb-5">
                Quando você comprar algo, o pedido aparece aqui.
              </p>
              <Link
                href="/produtos"
                className="inline-block bg-terracota hover:bg-terracota/90 text-white font-semibold text-sm px-6 py-2 rounded-full transition-colors"
              >
                Explorar produtos
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {orders.map((order) => (
                <article
                  key={order.id}
                  id={`pedido-${order.id}`}
                  className="bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm p-5"
                  style={{ borderRadius: "16px" }}
                >
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-border dark:border-[#3d2c1a]">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Pedido #{order.id.slice(0, 8)} ·{" "}
                        <RelativeTime date={order.created_at} />
                      </p>
                      <p className="font-bold text-terracota mt-0.5">
                        {formatPrice(order.total_amount)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        BUYER_ORDER_STATUS_CLASS[getBuyerOrderStatus(order.status)]
                      }`}
                    >
                      {getBuyerOrderStatusLabel(order.status)}
                    </span>
                  </div>

                  <ul className="flex flex-col gap-3 mt-3">
                    {order.items.map((item) => {
                      const img =
                        item.product?.images?.find((i) => i.is_cover)?.url ??
                        item.product?.images?.[0]?.url ??
                        PLACEHOLDER_PRODUCT_IMG;
                      return (
                        <li key={item.id} className="flex items-center gap-3">
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-cream dark:bg-[#3d2c1a] flex-shrink-0">
                            <Image
                              src={img}
                              alt={item.product?.name ?? "Produto"}
                              fill
                              className="object-cover"
                              sizes="48px"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-dark dark:text-[#f5edd6] truncate">
                              {item.product?.slug ? (
                                <Link
                                  href={`/produtos/${item.product.slug}`}
                                  className="hover:text-terracota transition-colors"
                                >
                                  {item.product.name}
                                </Link>
                              ) : (
                                (item.product?.name ?? "Produto removido")
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity} × {formatPrice(item.unit_price)}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-semibold text-dark dark:text-[#f5edd6]">
                              {formatPrice(item.subtotal)}
                            </span>
                            {item.item_status === "delivered" && !reviewedItemIds.has(item.id) && (
                              <ReviewForm orderItemId={item.id} productName={item.product?.name ?? "produto"} />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Uma conversa por loja do pedido (um pedido pode ter várias lojas). */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 pt-3 border-t border-border dark:border-[#3d2c1a]">
                    {storesOfOrder(order).map((store, _index, all) => (
                      <SendMessageButton
                        key={store.id}
                        storeId={store.id}
                        orderId={order.id}
                        variant="link"
                        label={
                          all.length > 1
                            ? `Falar com ${store.name} sobre este pedido`
                            : "Falar com a loja sobre este pedido"
                        }
                      />
                    ))}
                  </div>

                  {order.shipments.length > 0 && (
                    <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-border dark:border-[#3d2c1a]">
                      {order.shipments.map((shipment) => (
                        <div
                          key={shipment.store_id}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Truck size={14} className="text-terracota flex-shrink-0" />
                            <span className="text-muted-foreground truncate">
                              {shipment.store?.name ?? "Loja"}
                              {shipment.service_name ? ` · ${shipment.service_name}` : ""}
                              {shipment.tracking_code ? ` · ${shipment.tracking_code}` : ""}
                            </span>
                          </div>
                          {order.status !== "pending" && (
                            <span
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                                BUYER_ORDER_STATUS_CLASS[getBuyerOrderStatus(order.status, shipment.status)]
                              }`}
                            >
                              {getBuyerOrderStatusLabel(order.status, shipment.status)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
