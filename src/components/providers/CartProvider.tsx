"use client";

import { CartContext, useCartState } from "@/hooks/useCart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const cart = useCartState();
  return <CartContext.Provider value={cart}>{children}</CartContext.Provider>;
}
