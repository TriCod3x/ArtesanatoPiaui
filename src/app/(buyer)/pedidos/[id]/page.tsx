import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Package } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { PixPayment } from "@/components/checkout/PixPayment";
import { OrderStatusWatcher } from "@/components/checkout/OrderStatusWatcher";
import { PaymentStatusBadge } from "@/components/checkout/PaymentStatusBadge";

export const metadata = { title: "Pedido — Artesanatos Piauí" };

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/pedidos/${id}`);

  const { data: order } = await supabase
    .from("orders")
    .select(
      `id, status, total_amount, notes, created_at, buyer_id,
       items:order_items(id, quantity, unit_price, subtotal, item_status,
         product:products(name, slug, images:product_images(url, is_cover, position)),
         store:stores(name, slug)),
       payment:payments(method, status, pix_qr_code, pix_qr_code_url, pix_expires_at)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();
  if (order.buyer_id !== user.id) redirect("/");

  const payment = Array.isArray(order.payment) ? order.payment[0] : order.payment;
  const items = order.items ?? [];
  const showPix =
    payment?.method === "pix" &&
    payment.status === "pending" &&
    order.status === "pending";

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <OrderStatusWatcher
        orderId={order.id}
        active={payment?.status === "pending" && order.status === "pending"}
      />

      <Link
        href="/pedidos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-terracota mb-6"
      >
        <ArrowLeft size={15} /> Meus pedidos
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-dark dark:text-[#f5edd6]">
            Pedido #{order.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(order.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
        <PaymentStatusBadge
          orderStatus={order.status}
          paymentStatus={payment?.status ?? null}
        />
      </div>

      {showPix && (
        <div className="mb-8">
          <PixPayment
            orderId={order.id}
            qrCode={payment?.pix_qr_code ?? null}
            qrCodeUrl={payment?.pix_qr_code_url ?? null}
            expiresAt={payment?.pix_expires_at ?? null}
          />
        </div>
      )}

      {!showPix && order.status === "pending" && (
        <div className="mb-8 bg-amber/10 border border-amber/30 rounded-xl p-4 text-sm text-dark dark:text-[#f5edd6]">
          {payment
            ? "Estamos aguardando a confirmação do pagamento."
            : "O pagamento ainda não foi iniciado para este pedido."}
        </div>
      )}

      {/* Itens */}
      <div className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] divide-y divide-border dark:divide-[#3d2c1a]">
        {items.map((item) => {
          const product = Array.isArray(item.product) ? item.product[0] : item.product;
          const store = Array.isArray(item.store) ? item.store[0] : item.store;
          const images = (product?.images ?? []) as {
            url: string;
            is_cover: boolean;
            position: number;
          }[];
          const cover =
            images.find((i) => i.is_cover)?.url ??
            images[0]?.url ??
            "/images/placeholder-product.png";
          return (
            <div key={item.id} className="flex gap-4 p-4">
              <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-cream">
                <Image src={cover} alt={product?.name ?? ""} fill className="object-cover" sizes="64px" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dark dark:text-[#f5edd6] line-clamp-1">
                  {product?.name}
                </p>
                <p className="text-xs text-muted-foreground">{store?.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.quantity} × {formatPrice(item.unit_price)}
                </p>
              </div>
              <p className="text-sm font-semibold text-dark dark:text-[#f5edd6]">
                {formatPrice(item.subtotal)}
              </p>
            </div>
          );
        })}
        <div className="flex justify-between p-4 font-bold text-dark dark:text-[#f5edd6]">
          <span>Total</span>
          <span>{formatPrice(order.total_amount)}</span>
        </div>
      </div>

      {order.status !== "pending" && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Package size={15} />
          Acompanhe o envio pelo WhatsApp da loja.
        </div>
      )}
    </main>
  );
}
