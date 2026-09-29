import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "../../components/ui";
import type { Product } from "../../lib/types";
import { MAX_QTY, useCart } from "./CartProvider";

export function QuantityInput({
  value,
  onChange,
  max = MAX_QTY,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
  label: string;
}) {
  const btn = "grid size-9 place-items-center text-lg text-text-dim hover:text-text disabled:opacity-30";
  return (
    <div className="inline-flex items-center rounded-md border border-border-strong" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Diminuir">
        −
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Aumentar">
        +
      </button>
    </div>
  );
}

export function AddToCart({ product }: { product: Product }) {
  const { add, lines } = useCart();
  const inCart = lines.find((l) => l.product.id === product.id)?.quantity ?? 0;
  const max = Math.min(MAX_QTY, product.stock) - inCart;
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  if (max <= 0) {
    return (
      <p className="text-sm text-text-dim">
        Você já tem todo o estoque disponível no{" "}
        <Link to="/carrinho" className="font-medium text-accent underline">
          carrinho
        </Link>
        .
      </p>
    );
  }

  return (
    <div>
      <div className="flex gap-3">
        <QuantityInput value={Math.min(qty, max)} onChange={setQty} max={max} label="Quantidade" />
        <Button
          className="flex-1 py-3"
          onClick={() => {
            add(product, Math.min(qty, max));
            setQty(1);
            setAdded(true);
            setTimeout(() => setAdded(false), 2500);
          }}
        >
          Adicionar ao carrinho
        </Button>
      </div>
      <AnimatePresence>
        {added && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            className="mt-3 text-sm text-ok"
          >
            Adicionado.{" "}
            <Link to="/carrinho" className="font-semibold underline">
              Ver carrinho
            </Link>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CartButton() {
  const { count } = useCart();
  return (
    <Link
      to="/carrinho"
      className="relative grid size-10 place-items-center rounded-full hover:bg-surface-hover"
      aria-label={`Carrinho, ${count} ${count === 1 ? "item" : "itens"}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M5 7h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 7Z" strokeLinejoin="round" />
        <path d="M9 10V6a3 3 0 0 1 6 0v4" strokeLinecap="round" />
      </svg>
      <AnimatePresence>
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-bg"
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
