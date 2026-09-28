import Image from "next/image";
import { Store } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { PLACEHOLDER_PRODUCT_IMG } from "@/lib/constants";
import type { CartItem, ShippingOption } from "@/types";
import type { StoreShippingQuote } from "@/actions/shipping";

export interface OrderSummaryGroup {
  storeId: string;
  storeName: string;
  items: CartItem[];
  subtotal: number;
}

interface OrderSummaryProps {
  groups: OrderSummaryGroup[];
  quotes: StoreShippingQuote[] | null;
  selectedShipping: Record<string, ShippingOption>;
  total: number;
  shippingTotal: number;
  grandTotal: number;
}

function StoreShippingLine({
  storeId,
  quotes,
  selectedShipping,
}: {
  storeId: string;
  quotes: StoreShippingQuote[] | null;
  selectedShipping: Record<string, ShippingOption>;
}) {
  const selected = selectedShipping[storeId];
  if (selected) return <span className="font-medium text-dark dark:text-[#f5edd6]">{formatPrice(selected.price)}</span>;
  if (!quotes) return <span className="text-[#5A4632] dark:text-[#D9C4A0]">calculado após o CEP</span>;
  return <span className="text-[#5A4632] dark:text-[#D9C4A0]">selecione a entrega</span>;
}

export function OrderSummary({ groups, quotes, selectedShipping, total, shippingTotal, grandTotal }: OrderSummaryProps) {
  const anyShippingSelected = Object.keys(selectedShipping).length > 0;
  // Com uma loja só, o frete da loja E o frete total são o mesmo número — mostrar
  // os dois seria duplicar a mesma informação. Com várias lojas, o frete por loja
  // é informação nova (a soma no bloco final não deixa claro quanto é de cada).
  const showPerStoreShipping = groups.length > 1;

  return (
    <div
      className="bg-white dark:bg-[#2a1e0f] border border-[#8a6a4a]/40 shadow-sm p-5"
      style={{ borderRadius: "16px" }}
    >
      <p className="font-semibold text-dark dark:text-[#f5edd6] mb-4">Resumo do pedido</p>

      <div className="flex flex-col gap-4 mb-4 max-h-72 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.storeId}>
            <div className="flex items-center gap-1.5 mb-2">
              <Store size={13} className="text-terracota" />
              <span className="text-sm font-medium text-dark dark:text-[#f5edd6] truncate">{group.storeName}</span>
            </div>
            <ul className="flex flex-col gap-2 mb-2">
              {group.items.map(({ product, quantity }) => {
                const img = product.images?.[0]?.url ?? PLACEHOLDER_PRODUCT_IMG;
                return (
                  <li key={product.id} className="flex items-center gap-2">
                    <div className="relative w-9 h-9 rounded-md overflow-hidden bg-cream dark:bg-[#3d2c1a] flex-shrink-0">
                      <Image src={img} alt={product.name} fill className="object-cover" sizes="36px" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-dark dark:text-[#f5edd6] truncate">{product.name}</p>
                      <p className="text-xs text-[#5A4632] dark:text-[#D9C4A0]">
                        {quantity} × {formatPrice(product.price)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#5A4632] dark:text-[#D9C4A0]">Subtotal</span>
              <span className="font-medium text-dark dark:text-[#f5edd6]">{formatPrice(group.subtotal)}</span>
            </div>
            {showPerStoreShipping && (
              <div className="flex items-center justify-between text-xs mt-0.5">
                <span className="text-[#5A4632] dark:text-[#D9C4A0]">Frete</span>
                <StoreShippingLine storeId={group.storeId} quotes={quotes} selectedShipping={selectedShipping} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-[#8a6a4a]/30 pt-3 flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#5A4632] dark:text-[#D9C4A0]">Produtos</span>
          <span className="text-dark dark:text-[#f5edd6]">{formatPrice(total)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#5A4632] dark:text-[#D9C4A0]">Frete</span>
          <span className="text-dark dark:text-[#f5edd6]">
            {anyShippingSelected ? formatPrice(shippingTotal) : quotes ? "selecione a entrega" : "calculado após o CEP"}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1.5 pt-2 border-t border-[#8a6a4a]/30">
          <span className="font-semibold text-dark dark:text-[#f5edd6]">Total</span>
          <span className="font-bold text-lg text-terracota">{formatPrice(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}
