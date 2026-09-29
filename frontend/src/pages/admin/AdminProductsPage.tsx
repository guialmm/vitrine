import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { ProductPhoto } from "../../components/ProductPhoto";
import { Alert, Button, Field, Spinner, buttonClass } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import { ROAST_LABEL, brl, roastShort } from "../../lib/format";
import type { AdminProduct, Category, Page, Roast } from "../../lib/types";

export function AdminProductsPage() {
  const [q, setQ] = useState("");
  const { data, isPending } = useQuery({
    queryKey: ["admin", "products", q],
    queryFn: () => api<Page<AdminProduct>>("/admin/products", { params: { q, page_size: 100, sort: "name" } }),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar produto…"
          aria-label="Buscar produto"
          className="input max-w-xs"
        />
        <Link to="/admin/produtos/novo" className={buttonClass("primary")}>
          Novo produto
        </Link>
      </div>
      {isPending && <Spinner className="mt-8 size-6 text-text-dim" />}
      {data && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="py-3 font-semibold">Produto</th>
                <th className="py-3 font-semibold">Torra</th>
                <th className="py-3 text-right font-semibold">Preço</th>
                <th className="py-3 text-right font-semibold">Estoque</th>
                <th className="py-3 pl-6 font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((p) => (
                <tr key={p.id} className={p.is_active ? "" : "text-text-muted"}>
                  <td className="py-3">
                    <Link to={`/admin/produtos/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <span className="block text-xs text-text-muted">{p.category?.name ?? "Sem categoria"}</span>
                  </td>
                  <td className="py-3">{p.roast ? roastShort(p.roast) : "—"}</td>
                  <td className="py-3 text-right">{brl(p.price_cents)}</td>
                  <td className={`py-3 text-right font-medium ${p.stock === 0 ? "text-danger" : p.stock <= 10 ? "text-accent" : ""}`}>
                    {p.stock}
                  </td>
                  <td className="py-3 pl-6">{p.is_active ? "Ativo" : "Arquivado"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type FormState = {
  name: string;
  slug: string;
  origin: string;
  roast: Roast | "";
  tasting_notes: string;
  description: string;
  price: string; // reais, as typed ("59,90")
  stock: string;
  category_id: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  name: "",
  slug: "",
  origin: "",
  roast: "media",
  tasting_notes: "",
  description: "",
  price: "",
  stock: "0",
  category_id: "",
  is_active: true,
};

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** "59,90" or "59.90" -> 5990 */
const toCents = (price: string) => Math.round(Number(price.replace(/\./g, "").replace(",", ".")) * 100);
const fromCents = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function ProductForm({ initial, productId }: { initial: FormState; productId?: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!!productId);
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const priceCents = toCents(form.price);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        slug: form.slug,
        origin: form.origin.trim(),
        roast: form.roast,
        tasting_notes: form.tasting_notes.trim(),
        description: form.description.trim(),
        price_cents: priceCents,
        stock: Number(form.stock),
        category_id: form.category_id ? Number(form.category_id) : null,
        is_active: form.is_active,
      };
      return productId
        ? api<AdminProduct>(`/admin/products/${productId}`, { method: "PATCH", body })
        : api<AdminProduct>("/admin/products", { method: "POST", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      navigate("/admin/produtos");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nome">
            <input
              className="input"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (!slugTouched) set("slug", slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Slug (URL)">
            <input
              className="input font-mono text-sm"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
            />
          </Field>
          <Field label="Origem">
            <input className="input" value={form.origin} onChange={(e) => set("origin", e.target.value)} placeholder="Sul de Minas, MG" />
          </Field>
          <Field label="Categoria">
            <select className="input" value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
              <option value="">Sem categoria</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Torra">
            <select className="input" value={form.roast} onChange={(e) => set("roast", e.target.value as Roast)}>
              {Object.entries(ROAST_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notas sensoriais">
            <input className="input" value={form.tasting_notes} onChange={(e) => set("tasting_notes", e.target.value)} placeholder="caramelo, laranja" />
          </Field>
          <Field label="Preço (R$)" error={form.price && !(priceCents > 0) ? "Preço inválido." : undefined}>
            <input className="input" required inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="59,90" />
          </Field>
          <Field label="Estoque">
            <input className="input" type="number" min={0} required value={form.stock} onChange={(e) => set("stock", e.target.value)} />
          </Field>
        </div>
        <Field label="Descrição">
          <textarea className="input min-h-28" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="size-4 accent-[var(--color-ink)]" />
          Visível na loja
        </label>
        {save.error && (
          <Alert>
            {save.error instanceof ApiError && save.error.status === 409
              ? "Já existe um produto com esse slug."
              : save.error.message}
          </Alert>
        )}
        <div className="flex gap-3">
          <Button type="submit" loading={save.isPending} disabled={!(priceCents > 0)}>
            {productId ? "Salvar alterações" : "Criar produto"}
          </Button>
          <Link to="/admin/produtos" className={buttonClass("ghost")}>
            Cancelar
          </Link>
        </div>
      </div>

      <aside>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Pré-visualização</p>
        <ProductPhoto
          className="rounded-md"
          product={{
            name: form.name || "Nome do café",
            origin: form.origin || "Origem",
            roast: form.roast,
            tasting_notes: form.tasting_notes || "notas sensoriais",
          }}
        />
        <p className="mt-3 font-semibold">{form.name || "Nome do café"}</p>
        <p className="text-sm text-text-dim">{priceCents > 0 ? brl(priceCents) : "—"}</p>
      </aside>
    </form>
  );
}

export function AdminProductFormPage() {
  const { id } = useParams();
  const productId = id ? Number(id) : undefined;
  // No single-product admin endpoint: the list is small and already cached.
  const { data } = useQuery({
    queryKey: ["admin", "products", ""],
    queryFn: () => api<Page<AdminProduct>>("/admin/products", { params: { page_size: 100, sort: "name" } }),
    enabled: !!productId,
  });
  const product = data?.items.find((p) => p.id === productId);

  if (productId && !data) return <Spinner className="size-6 text-text-dim" />;
  if (productId && !product) return <p className="text-text-dim">Produto não encontrado.</p>;

  const initial: FormState = product
    ? {
        name: product.name,
        slug: product.slug,
        origin: product.origin,
        roast: product.roast,
        tasting_notes: product.tasting_notes,
        description: product.description,
        price: fromCents(product.price_cents),
        stock: String(product.stock),
        category_id: product.category ? String(product.category.id) : "",
        is_active: product.is_active,
      }
    : EMPTY;

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold">{product ? `Editar: ${product.name}` : "Novo produto"}</h2>
      <ProductForm key={productId ?? "new"} initial={initial} productId={productId} />
    </div>
  );
}
