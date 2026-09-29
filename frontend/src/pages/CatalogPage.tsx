import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { ProductCard } from "../components/ProductCard";
import { Alert } from "../components/ui";
import { api } from "../lib/api";
import { ROAST_LABEL, roastShort } from "../lib/format";
import type { Category, Page, Product } from "../lib/types";

const PAGE_SIZE = 12;

const SORTS = {
  newest: "Mais recentes",
  price_asc: "Menor preço",
  price_desc: "Maior preço",
  name: "Nome (A–Z)",
} as const;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
        active ? "border-ink bg-ink text-bg" : "border-border-strong text-text-dim hover:border-ink hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

export function CatalogPage() {
  // The URL is the single source of truth for filters: shareable, and the
  // browser's back button restores the previous filter state.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const roast = params.get("roast") ?? "";
  const inStock = params.get("in_stock") === "1";
  const sort = (params.get("sort") ?? "newest") as keyof typeof SORTS;
  const page = Math.max(1, Number(params.get("page")) || 1);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page"); // any filter change goes back to page 1
    setParams(next, { replace: "q" in changes }); // typing shouldn't flood history
  };

  // Debounced search box: the input is local state, the URL updates after a pause.
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => update({ q: search.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/categories"),
    staleTime: Infinity,
  });

  const { data, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: ["products", { q, category, roast, inStock, sort, page }],
    queryFn: () =>
      api<Page<Product>>("/products", {
        params: { q, category, roast, in_stock: inStock, sort, page, page_size: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData, // no flash of empty grid between pages
  });

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const hasFilters = q || category || roast || inStock;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Cafés</h1>
      <p className="mt-2 text-text-dim">Grãos e moídos de pequenos produtores, torrados toda semana.</p>

      <div className="mt-8 space-y-4 border-y border-border py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar: nome, origem, nota…"
            aria-label="Buscar cafés"
            className="input sm:max-w-sm"
          />
          <label className="flex items-center gap-2 text-sm text-text-dim sm:ml-auto">
            Ordenar
            <select
              value={sort}
              onChange={(e) => update({ sort: e.target.value === "newest" ? null : e.target.value })}
              className="input w-auto py-2"
            >
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-12 text-xs font-semibold uppercase tracking-wide text-text-muted">Tipo</span>
          <Chip active={!category} onClick={() => update({ category: null })}>
            Todos
          </Chip>
          {categories?.map((c) => (
            <Chip key={c.id} active={category === c.slug} onClick={() => update({ category: c.slug })}>
              {c.name}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-12 text-xs font-semibold uppercase tracking-wide text-text-muted">Torra</span>
          {Object.keys(ROAST_LABEL).map((value) => (
            <Chip
              key={value}
              active={roast === value}
              onClick={() => update({ roast: roast === value ? null : value })}
            >
              {roastShort(value)}
            </Chip>
          ))}
          <label className="flex cursor-pointer items-center gap-2 py-1.5 text-sm text-text-dim sm:ml-auto">
            <input
              type="checkbox"
              checked={inStock}
              onChange={(e) => update({ in_stock: e.target.checked ? "1" : null })}
              className="size-4 accent-[var(--color-ink)]"
            />
            Só em estoque
          </label>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
        <span aria-live="polite">
          {data && `${data.total} ${data.total === 1 ? "café" : "cafés"}`}
        </span>
        {hasFilters && (
          <button
            onClick={() => setParams(new URLSearchParams())}
            className="font-medium text-accent hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {isError && (
        <div className="mt-8">
          <Alert>Não foi possível carregar os cafés. Tente novamente em instantes.</Alert>
        </div>
      )}

      <div
        className={`mt-6 grid grid-cols-2 gap-x-5 gap-y-10 transition-opacity lg:grid-cols-4 ${
          isPlaceholderData ? "opacity-60" : ""
        }`}
      >
        {isPending &&
          Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-md bg-bg-elev-2" />
          ))}
        {data?.items.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>

      {data && data.total === 0 && (
        <div className="py-20 text-center">
          <p className="font-semibold">Nenhum café encontrado.</p>
          <p className="mt-1 text-sm text-text-dim">Tente outra busca ou remova alguns filtros.</p>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-12 flex items-center justify-center gap-2" aria-label="Paginação">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => update({ page: n === 1 ? null : String(n) })}
              aria-current={n === page ? "page" : undefined}
              className={`size-9 rounded-md text-sm font-medium ${
                n === page ? "bg-ink text-bg" : "text-text-dim hover:bg-surface-hover"
              }`}
            >
              {n}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
