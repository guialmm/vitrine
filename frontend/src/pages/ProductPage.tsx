import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { ProductCard } from "../components/ProductCard";
import { ProductPhoto } from "../components/ProductPhoto";
import { ApiError, api } from "../lib/api";
import { ROAST_LABEL, brl } from "../lib/format";
import type { Page, Product } from "../lib/types";
import { NotFoundPage } from "./NotFoundPage";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-3 text-sm">
      <dt className="text-text-dim">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export function ProductPage({ buySlot }: { buySlot?: (product: Product) => React.ReactNode }) {
  const { slug = "" } = useParams();
  const { data: product, error, isPending } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => api<Product>(`/products/${slug}`),
  });
  const { data: related } = useQuery({
    queryKey: ["products", { category: product?.category?.slug, page_size: 5 }],
    queryFn: () => api<Page<Product>>("/products", { params: { category: product?.category?.slug, page_size: 5 } }),
    enabled: !!product?.category,
  });

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (isPending || !product) {
    return (
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 sm:px-6 md:grid-cols-2">
        <div className="aspect-[4/5] animate-pulse rounded-md bg-bg-elev-2" />
        <div className="space-y-4">
          <div className="h-10 w-2/3 animate-pulse rounded bg-bg-elev-2" />
          <div className="h-5 w-1/3 animate-pulse rounded bg-bg-elev-2" />
        </div>
      </div>
    );
  }

  const others = related?.items.filter((p) => p.id !== product.id).slice(0, 4) ?? [];
  const soldOut = product.stock === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <nav className="text-sm text-text-muted" aria-label="Navegação estrutural">
        <Link to="/cafes" className="hover:text-text">
          Cafés
        </Link>
        {product.category && (
          <>
            {" / "}
            <Link to={`/cafes?category=${product.category.slug}`} className="hover:text-text">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-2 md:gap-14">
        <ProductPhoto product={product} className="rounded-md" eager />

        <div className="md:pt-4">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{product.name}</h1>
          <p className="mt-2 text-text-dim">{product.origin}</p>
          <p className="mt-6 text-2xl font-semibold">{brl(product.price_cents)}</p>
          <p className="text-sm text-text-muted">Pacote de 250 g</p>

          <div className="mt-8">
            {soldOut ? (
              <p className="rounded-md border border-border-strong px-4 py-3 text-sm text-text-dim">
                Esgotado no momento. Esse lote volta na próxima safra.
              </p>
            ) : (
              buySlot?.(product)
            )}
            {!soldOut && product.stock <= 10 && (
              <p className="mt-3 text-sm text-accent">Últimas {product.stock} unidades deste lote.</p>
            )}
          </div>

          <p className="mt-10 leading-relaxed text-text-dim">{product.description}</p>

          <dl className="mt-8 border-t border-border">
            <Detail label="Notas sensoriais" value={product.tasting_notes} />
            <Detail label="Torra" value={ROAST_LABEL[product.roast] ?? "—"} />
            <Detail label="Origem" value={product.origin} />
            {product.category && <Detail label="Tipo" value={product.category.name} />}
          </dl>
        </div>
      </div>

      {others.length > 0 && (
        <section className="mt-24">
          <h2 className="border-b border-border pb-4 text-2xl font-extrabold tracking-tight">Mais cafés</h2>
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
            {others.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
