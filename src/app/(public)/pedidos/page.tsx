import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { formatPrice } from "@/lib/utils";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { PLACEHOLDER_PRODUCT_IMG } from "@/lib/constants";
import type { OrderStatus } from "@/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando pagamento",
  confirmed: "Confirmado",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber/15 text-amber",
  confirmed: "bg-capim/15 text-capim",
  shipped: "bg-blue-500/15 text-blue-500",
  delivered: "bg-green-600/15 text-green-600",
  cancelled: "bg-destructive/15 text-destructive",
};

interface OrderItemRow {
  id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  product: { name: string; slug: string; images: { url: string; is_cover: boolean }[] } | null;
}

interface OrderRow {
  id: string;
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  items: OrderItemRow[];
}

export default async function PedidosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/pedidos");

  const { data } = await supabase
    .from("orders")
    .select(
      `
      id, status, total_amount, created_at,
      items:order_items(
        id, quantity, unit_price, subtotal,
        product:products(name, slug, images:product_images(url, is_cover))
      )
    `,
    )
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as unknown as OrderRow[];

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
                        STATUS_STYLE[order.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[order.status] ?? order.status}
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
                          <span className="text-sm font-semibold text-dark dark:text-[#f5edd6]">
                            {formatPrice(item.subtotal)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
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
