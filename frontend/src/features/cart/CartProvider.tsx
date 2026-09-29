import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { Product } from "../../lib/types";

export const MAX_QTY = 20; // matches the backend's per-line limit

/** What the cart remembers about a product, so it can render without a request.
 * Prices shown from here are refreshed on the cart page and always recalculated
 * by the backend at checkout. */
export type CartProduct = Pick<
  Product,
  "id" | "slug" | "name" | "origin" | "roast" | "tasting_notes" | "price_cents" | "stock"
>;
export interface CartLine {
  product: CartProduct;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  count: number;
  add: (product: CartProduct, quantity: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
}

const STORAGE_KEY = "vitrine:cart";
const CartContext = createContext<CartState | null>(null);

function load(): CartLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const clamp = (n: number) => Math.max(1, Math.min(MAX_QTY, Math.floor(n)));

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Private mode / storage full: the cart still works for this session.
    }
  }, [lines]);

  // Keep several open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && setLines(load());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((product: CartProduct, quantity: number) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { product, quantity: clamp(l.quantity + quantity) } : l,
        );
      }
      return [...prev, { product, quantity: clamp(quantity) }];
    });
  }, []);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setLines((prev) => prev.map((l) => (l.product.id === productId ? { ...l, quantity: clamp(quantity) } : l)));
  }, []);

  const remove = useCallback((productId: number) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({ lines, count: lines.reduce((n, l) => n + l.quantity, 0), add, setQuantity, remove, clear }),
    [lines, add, setQuantity, remove, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
