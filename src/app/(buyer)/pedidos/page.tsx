import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Package } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { PaymentStatusBadge } from "@/components/checkout/PaymentStatusBadge";

export const metadata = { title: "Meus pedidos — Artesanatos Piauí" };

export default async function MeusPedidosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/pedidos");

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, status, total_amount, created_at, items:order_items(quantity), payment:payments(status)",
    )
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] mb-8">
        Meus pedidos
      </h1>

      {!orders || orders.length === 0 ? (
        <div className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-10 text-center">
          <Package size={28} className="text-terracota mx-auto mb-3" />
          <p className="text-dark dark:text-[#f5edd6] font-semibold mb-1">
            Você ainda não fez nenhum pedido
          </p>
          <Link href="/produtos" className="text-terracota text-sm hover:underline">
            Explorar produtos
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const payment = Array.isArray(order.payment) ? order.payment[0] : order.payment;
            const count = (order.items ?? []).reduce(
              (s: number, i: { quantity: number }) => s + i.quantity,
              0,
            );
            return (
              <li key={order.id}>
                <Link
                  href={`/pedidos/${order.id}`}
                  className="flex items-center justify-between gap-4 bg-white dark:bg-[#2a1e0f] rounded-xl border border-border dark:border-[#3d2c1a] p-4 hover:border-terracota/40 transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-dark dark:text-[#f5edd6]">
                      Pedido #{order.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(order.created_at).toLocaleDateString("pt-BR")} ·{" "}
                      {count} {count === 1 ? "item" : "itens"} · {formatPrice(order.total_amount)}
                    </p>
                  </div>
                  <PaymentStatusBadge
                    orderStatus={order.status}
                    paymentStatus={payment?.status ?? null}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
