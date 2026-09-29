import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { ProductPhoto } from "../components/ProductPhoto";
import { Alert, Button, buttonClass } from "../components/ui";
import { useAuth } from "../features/auth/AuthProvider";
import { MAX_QTY, useCart } from "../features/cart/CartProvider";
import { QuantityInput } from "../features/cart/components";
import { ApiError, api } from "../lib/api";
import { brl } from "../lib/format";
import type { Page, Product } from "../lib/types";

export function CartPage() {
  const { lines, setQuantity, remove } = useCart();
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  // Fresh prices and stock: the cart in localStorage may be days old.
  const { data: live } = useQuery({
    queryKey: ["products", "cart-refresh"],
    queryFn: () => api<Page<Product>>("/products", { params: { page_size: 60 } }),
    enabled: lines.length > 0,
    staleTime: 0,
  });
  const liveById = new Map(live?.items.map((p) => [p.id, p]));

  const rows = lines.map((line) => {
    const current = liveById.get(line.product.id);
    const product = current ?? line.product;
    const available = live ? (current?.stock ?? 0) : line.product.stock;
    return {
      ...line,
      product,
      unavailable: !!live && (!current || current.stock === 0),
      shortBy: live && current && current.stock > 0 && line.quantity > current.stock ? current.stock : null,
      priceChanged: !!current && current.price_cents !== line.product.price_cents,
      max: Math.min(MAX_QTY, available),
    };
  });
  const buyable = rows.filter((r) => !r.unavailable);
  const total = buyable.reduce((sum, r) => sum + r.product.price_cents * Math.min(r.quantity, r.max), 0);
  const blocked = rows.some((r) => r.shortBy !== null);

  const checkout = useMutation({
    mutationFn: () =>
      api<{ checkout_url: string }>("/checkout", {
        method: "POST",
        body: { items: buyable.map((r) => ({ product_id: r.product.id, quantity: r.quantity })) },
      }),
    onSuccess: ({ checkout_url }) => window.location.assign(checkout_url),
    onError: () => queryClient.invalidateQueries({ queryKey: ["products", "cart-refresh"] }),
  });

  // Back from Stripe without paying: release the reserved stock right away.
  const cancelledOrder = params.get("checkout") === "cancelado" ? params.get("pedido") : null;
  const cancelSent = useRef(false);
  useEffect(() => {
    if (!cancelledOrder || !ready || !user || cancelSent.current) return;
    cancelSent.current = true;
    api(`/orders/${cancelledOrder}/cancel`, { method: "POST" })
      .catch(() => {}) // the stale-order job will release it anyway
      .finally(() => queryClient.invalidateQueries({ queryKey: ["products"] }));
  }, [cancelledOrder, ready, user, queryClient]);

  const onCheckout = () => {
    if (!user) return navigate("/login?next=/carrinho");
    checkout.mutate();
  };

  const cameBackFromStripe = params.get("checkout") === "cancelado";

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-28 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Seu carrinho está vazio</h1>
        <p className="mt-3 text-text-dim">Escolha um café e ele aparece aqui.</p>
        <Link to="/cafes" className={buttonClass("primary", "mt-8")}>
          Ver cafés
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Carrinho</h1>

      {cameBackFromStripe && (
        <div className="mt-6">
          <Alert tone="info">
            Pagamento não concluído — nada foi cobrado. Seu carrinho continua aqui.{" "}
            <button className="font-semibold underline" onClick={() => setParams({}, { replace: true })}>
              Ok
            </button>
          </Alert>
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <ul className="divide-y divide-border border-y border-border">
          {rows.map((r) => (
            <li key={r.product.id} className="flex gap-4 py-5">
              <Link to={`/cafes/${r.product.slug}`} className="w-24 shrink-0 overflow-hidden rounded-md sm:w-28">
                <ProductPhoto product={r.product} />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <Link to={`/cafes/${r.product.slug}`} className="font-semibold hover:underline">
                      {r.product.name}
                    </Link>
                    <p className="text-sm text-text-dim">{r.product.origin}</p>
                  </div>
                  <p className="shrink-0 font-semibold">
                    {r.unavailable ? "—" : brl(r.product.price_cents * r.quantity)}
                  </p>
                </div>
                {r.unavailable && <p className="mt-2 text-sm text-danger">Indisponível no momento — não entra no pedido.</p>}
                {r.shortBy !== null && (
                  <p className="mt-2 text-sm text-danger">
                    Só {r.shortBy} em estoque.{" "}
                    <button className="font-semibold underline" onClick={() => setQuantity(r.product.id, r.shortBy!)}>
                      Ajustar
                    </button>
                  </p>
                )}
                {r.priceChanged && !r.unavailable && (
                  <p className="mt-2 text-sm text-accent">O preço mudou desde que você adicionou este café.</p>
                )}
                <div className="mt-auto flex items-center justify-between pt-3">
                  {!r.unavailable ? (
                    <QuantityInput
                      value={r.quantity}
                      onChange={(n) => setQuantity(r.product.id, n)}
                      max={Math.max(r.max, 1)}
                      label={`Quantidade de ${r.product.name}`}
                    />
                  ) : (
                    <span />
                  )}
                  <button onClick={() => remove(r.product.id)} className="text-sm text-text-muted hover:text-danger">
                    Remover
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="h-fit lg:sticky lg:top-24">
          <div className="card p-6">
            <h2 className="font-semibold">Resumo</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-dim">Subtotal</dt>
                <dd>{brl(total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-dim">Frete</dt>
                <dd>Grátis</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd>{brl(total)}</dd>
              </div>
            </dl>

            {checkout.error && (
              <div className="mt-4">
                <Alert>
                  {checkout.error instanceof ApiError && checkout.error.status === 409
                    ? `Estoque insuficiente: ${checkout.error.message.replace("Not enough stock: ", "")}. Ajuste a quantidade.`
                    : checkout.error instanceof ApiError && checkout.error.status === 403
                      ? "Confirme seu e-mail antes de comprar — o link está na sua caixa de entrada."
                      : "Não foi possível iniciar o pagamento. Tente de novo em instantes."}
                </Alert>
              </div>
            )}
            {user && !user.is_verified && !checkout.error && (
              <p className="mt-4 text-sm text-accent">Confirme seu e-mail para finalizar a compra.</p>
            )}

            <Button
              className="mt-5 w-full py-3"
              onClick={onCheckout}
              loading={checkout.isPending || checkout.isSuccess}
              disabled={buyable.length === 0 || blocked || (!!user && !user.is_verified)}
            >
              {user ? "Ir para o pagamento" : "Entrar para finalizar"}
            </Button>
            <p className="mt-3 text-center text-xs text-text-muted">
              Pagamento processado pelo Stripe. Em modo de teste, use o cartão 4242 4242 4242 4242.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
