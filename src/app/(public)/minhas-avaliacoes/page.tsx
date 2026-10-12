import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { ReviewForm } from "@/components/orders/ReviewForm";
import { PLACEHOLDER_PRODUCT_IMG } from "@/lib/constants";

export const metadata = { title: "Minhas avaliações" };
export const dynamic = "force-dynamic";

interface ProductInfo {
  name: string;
  slug: string;
  images: { url: string; is_cover: boolean }[] | null;
}

interface DeliveredItemRow {
  id: string;
  product: ProductInfo | ProductInfo[] | null;
  store: { name: string } | { name: string }[] | null;
  order: { created_at: string } | { created_at: string }[] | null;
}

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  product: ProductInfo | ProductInfo[] | null;
  store: { name: string } | { name: string }[] | null;
}

const one = <T,>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

const coverOf = (product: ProductInfo | null) =>
  product?.images?.find((i) => i.is_cover)?.url ?? product?.images?.[0]?.url ?? PLACEHOLDER_PRODUCT_IMG;

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          className={n <= rating ? "text-amber fill-amber" : "text-muted-foreground/40"}
        />
      ))}
    </span>
  );
}

function ProductThumb({ product }: { product: ProductInfo | null }) {
  return (
    <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-cream dark:bg-[#3d2c1a] flex-shrink-0">
      <Image
        src={coverOf(product)}
        alt={product?.name ?? "Produto"}
        fill
        className="object-cover"
        sizes="48px"
      />
    </div>
  );
}

const CARD =
  "bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] shadow-sm p-4 flex gap-3";

export default async function MinhasAvaliacoesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/minhas-avaliacoes");

  // Mesma regra de createReview / da policy: só item ENTREGUE de pedido do
  // próprio comprador, e a avaliação sempre referencia o order_item_id.
  const [{ data: deliveredData }, { data: reviewsData }] = await Promise.all([
    supabase
      .from("order_items")
      .select(
        `id,
         product:products(name, slug, images:product_images(url, is_cover)),
         store:stores(name),
         order:orders!inner(buyer_id, created_at)`,
      )
      .eq("item_status", "delivered")
      .eq("order.buyer_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("reviews")
      .select(
        `id, rating, comment, created_at, order_item_id,
         product:products(name, slug, images:product_images(url, is_cover)),
         store:stores(name)`,
      )
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const delivered = (deliveredData ?? []) as unknown as DeliveredItemRow[];
  const reviews = (reviewsData ?? []) as unknown as (ReviewRow & { order_item_id: string | null })[];

  const reviewedItemIds = new Set(reviews.map((r) => r.order_item_id));
  const pending = delivered.filter((item) => !reviewedItemIds.has(item.id));

  return (
    <>
      <Header />
      <main className="flex-1 bg-background">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <header className="mb-8">
            <h1 className="font-display text-4xl font-bold text-dark dark:text-[#f5edd6]">
              Minhas avaliações
            </h1>
            <p className="text-muted-foreground mt-1">
              Avalie o que você já recebeu e veja o que você já disse sobre suas compras.
            </p>
          </header>

          <section className="mb-10">
            <h2 className="font-semibold text-lg text-dark dark:text-[#f5edd6] mb-3">
              Aguardando sua avaliação{" "}
              <span className="text-sm font-normal text-muted-foreground">({pending.length})</span>
            </h2>

            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-2xl p-6">
                Nenhum item entregue esperando avaliação.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {pending.map((item) => {
                  const product = one(item.product);
                  const store = one(item.store);
                  const order = one(item.order);
                  return (
                    <li key={item.id} className={CARD} style={{ borderRadius: "16px" }}>
                      <ProductThumb product={product} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-dark dark:text-[#f5edd6] truncate">
                          {product?.slug ? (
                            <Link
                              href={`/produtos/${product.slug}`}
                              className="hover:text-terracota transition-colors"
                            >
                              {product.name}
                            </Link>
                          ) : (
                            (product?.name ?? "Produto removido")
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {store?.name ?? "Loja"}
                          {order && (
                            <>
                              {" · comprado "}
                              <RelativeTime date={order.created_at} />
                            </>
                          )}
                        </p>
                        <ReviewForm orderItemId={item.id} productName={product?.name ?? "produto"} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-semibold text-lg text-dark dark:text-[#f5edd6] mb-3">
              Avaliações feitas{" "}
              <span className="text-sm font-normal text-muted-foreground">({reviews.length})</span>
            </h2>

            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-2xl p-6">
                Você ainda não avaliou nenhum produto.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {reviews.map((review) => {
                  const product = one(review.product);
                  const store = one(review.store);
                  return (
                    <li key={review.id} className={CARD} style={{ borderRadius: "16px" }}>
                      <ProductThumb product={product} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-dark dark:text-[#f5edd6] truncate">
                          {product?.slug ? (
                            <Link
                              href={`/produtos/${product.slug}`}
                              className="hover:text-terracota transition-colors"
                            >
                              {product.name}
                            </Link>
                          ) : (
                            (product?.name ?? "Produto removido")
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          <Stars rating={review.rating} />
                          <span>
                            {store?.name ?? "Loja"} · <RelativeTime date={review.created_at} />
                          </span>
                        </p>
                        {review.comment && (
                          <p className="text-sm text-dark dark:text-[#f5edd6] mt-2 whitespace-pre-wrap break-words">
                            {review.comment}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
