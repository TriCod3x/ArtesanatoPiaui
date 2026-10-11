// Consulta e formato de linha dos pedidos do comprador. Compartilhado entre a
// página /pedidos e o histórico da aba "Pedidos" do carrinho — a lógica de
// status continua só em src/lib/order-status.ts.

import type { OrderStatus } from "@/types";

export const BUYER_ORDERS_SELECT = `
      id, status, total_amount, created_at,
      items:order_items(
        id, quantity, unit_price, subtotal, item_status,
        product:products(name, slug, images:product_images(url, is_cover))
      ),
      shipments(store_id, service_name, status, tracking_code, store:stores(name))
    `;

export interface BuyerOrderItemRow {
  id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  item_status: string;
  product: { name: string; slug: string; images: { url: string; is_cover: boolean }[] } | null;
}

export interface BuyerShipmentRow {
  store_id: string;
  service_name: string | null;
  status: string;
  tracking_code: string | null;
  store: { name: string } | null;
}

export interface BuyerOrderRow {
  id: string;
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  items: BuyerOrderItemRow[];
  shipments: BuyerShipmentRow[];
}
