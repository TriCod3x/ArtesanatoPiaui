"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { CartItem, ProductWithRelations } from "@/types";

interface CartContextValue {
  items: CartItem[];
  add: (product: ProductWithRelations, quantity?: number) => void;
  remove: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  total: number;
  count: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

export const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "artesanatos-piaui:cart";

export function useCartState(): CartContextValue {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(JSON.parse(stored));
    } catch {}
  }, []);

  const add = useCallback((product: ProductWithRelations, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      const next = existing
        ? prev.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + quantity }
              : i
          )
        : [...prev, { product, quantity }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.product.id !== productId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity < 1) return;
    setItems((prev) => {
      const next = prev.map((i) =>
        i.product.id === productId ? { ...i, quantity } : i
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const total = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, add, remove, updateQuantity, clear, total, count, isOpen, openCart, closeCart };
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
