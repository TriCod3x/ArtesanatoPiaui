import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Image from "next/image";
import { Package } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { PaymentStatusBadge } from "@/components/checkout/PaymentStatusBadge";
import { FocusRefresher } from "@/components/checkout/FocusRefresher";

export const metadata = { title: "Pedidos da loja — Artesanatos Piauí" };

interface SellerItem {
  id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  item_status: string;
  created_at: string;
  order_id: string;
  product: { name: string; images: { url: string; is_cover: boolean }[] } | null;
}

export default async function SellerPedidosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "seller" && profile?.role !== "admin") redirect("/");

  const { data: store } = await supabase
    .from("stores")
    .select("id, name")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!store) redirect("/minha-loja/nova");

  // service role: precisamos cruzar order_items com orders/payments (fora do RLS do vendedor)
  const admin = createAdminClient();

  const { data: rawItems } = await admin
    .from("order_items")
    .select(
      "id, quantity, unit_price, subtotal, item_status, created_at, order_id, product:products(name, images:product_images(url, is_cover))",
    )
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  const items = (rawItems ?? []) as unknown as SellerItem[];
  const orderIds = [...new Set(items.map((i) => i.order_id))];

  const [{ data: orders }, { data: payments }] = await Promise.all([
    admin.from("orders").select("id, status, created_at").in("id", orderIds),
    admin.from("payments").select("order_id, status, method").in("order_id", orderIds),
  ]);

  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));
  const paymentByOrder = new Map((payments ?? []).map((p) => [p.order_id, p]));

  // agrupa itens por pedido
  const grouped = orderIds.map((orderId) => {
    const list = items.filter((i) => i.order_id === orderId);
    const subtotal = list.reduce((s, i) => s + Number(i.subtotal), 0);
    return {
      orderId,
      order: orderById.get(orderId),
      payment: paymentByOrder.get(orderId),
      items: list,
      subtotal,
    };
  });

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <FocusRefresher />

      <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] mb-2">
        Pedidos da loja
      </h1>
      <p className="text-muted-foreground mb-8">
        Pedidos que incluem produtos de <strong>{store.name}</strong>. O status de
        pagamento atualiza ao voltar para esta aba.
      </p>

      {grouped.length === 0 ? (
        <div className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-10 text-center">
          <Package size={28} className="text-terracota mx-auto mb-3" />
          <p className="text-dark dark:text-[#f5edd6] font-semibold">
            Nenhum pedido ainda
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Quando alguém comprar seus produtos, os pedidos aparecem aqui.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {grouped.map((g) => (
            <li
              key={g.orderId}
              className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-5"
            >
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <p className="text-sm font-semibold text-dark dark:text-[#f5edd6]">
                    Pedido #{g.orderId.slice(0, 8)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {g.order
                      ? new Date(g.order.created_at).toLocaleString("pt-BR")
                      : ""}
                  </p>
                </div>
                <PaymentStatusBadge
                  orderStatus={g.order?.status ?? "pending"}
                  paymentStatus={g.payment?.status ?? null}
                />
              </div>

              <div className="divide-y divide-border dark:divide-[#3d2c1a]">
                {g.items.map((item) => {
                  const cover =
                    item.product?.images?.find((i) => i.is_cover)?.url ??
                    item.product?.images?.[0]?.url ??
                    "/images/placeholder-product.png";
                  return (
                    <div key={item.id} className="flex gap-3 py-3">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-cream">
                        <Image
                          src={cover}
                          alt={item.product?.name ?? ""}
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-dark dark:text-[#f5edd6] line-clamp-1">
                          {item.product?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {formatPrice(item.unit_price)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-dark dark:text-[#f5edd6]">
                        {formatPrice(item.subtotal)}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between pt-3 text-sm font-bold text-dark dark:text-[#f5edd6]">
                <span>Subtotal da sua loja</span>
                <span>{formatPrice(g.subtotal)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
