import { Link } from "react-router";

import { brl } from "../lib/format";
import type { Product } from "../lib/types";
import { ProductPhoto } from "./ProductPhoto";

export function ProductCard({ product }: { product: Product }) {
  const soldOut = product.stock === 0;
  return (
    <Link to={`/cafes/${product.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-md">
        <ProductPhoto
          product={product}
          className="transition duration-500 group-hover:scale-[1.03]"
        />
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-sm bg-ink px-2 py-1 text-xs font-semibold text-bg">
            Esgotado
          </span>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold leading-tight group-hover:underline group-hover:underline-offset-4">
            {product.name}
          </h3>
          <p className="mt-0.5 text-sm text-text-dim">{product.origin}</p>
        </div>
        <p className={`shrink-0 font-semibold ${soldOut ? "text-text-muted line-through" : ""}`}>
          {brl(product.price_cents)}
        </p>
      </div>
      <p className="mt-1 text-sm text-text-muted">{product.tasting_notes}</p>
    </Link>
  );
}
