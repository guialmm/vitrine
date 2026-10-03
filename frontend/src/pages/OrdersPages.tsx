import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { Alert, Spinner, buttonClass } from "../components/ui";
import { useCart } from "../features/cart/CartProvider";
import { ApiError, api } from "../lib/api";
import { brl, dateTime } from "../lib/format";
import type { Order } from "../lib/types";
import { NotFoundPage } from "./NotFoundPage";

const shortId = (id: string) => id.slice(0, 8).toUpperCase();

export function OrdersPage() {
  const { data: orders, isPending, isError } = useQuery({
    queryKey: ["me", "orders"],
    queryFn: () => api<Order[]>("/orders"),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Meus pedidos</h1>
      {isPending && <Spinner className="mt-10 size-6 text-text-dim" />}
      {isError && (
        <div className="mt-8">
          <Alert>Não foi possível carregar seus pedidos.</Alert>
        </div>
      )}
      {orders?.length === 0 && (
        <div className="py-20 text-center">
          <p className="font-semibold">Você ainda não fez nenhum pedido.</p>
          <Link to="/cafes" className={buttonClass("primary", "mt-6")}>
            Ver cafés
          </Link>
        </div>
      )}
      {orders && orders.length > 0 && (
        <ul className="mt-8 divide-y divide-border border-y border-border">
          {orders.map((o) => (
            <li key={o.id}>
              <Link to={`/pedidos/${o.id}`} className="flex items-center gap-4 py-4 hover:bg-surface">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    Pedido <span className="font-mono text-sm">#{shortId(o.id)}</span>
                  </p>
                  <p className="truncate text-sm text-text-dim">
                    {dateTime(o.created_at)} · {o.items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold">{brl(o.total_cents)}</span>
                  <OrderStatusBadge status={o.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OrderPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const fromCheckout = params.get("checkout") === "sucesso";
  const { clear } = useCart();

  // Stripe only redirects here after a successful payment, so the cart is done.
  const cleared = useRef(false);
  useEffect(() => {
    if (fromCheckout && !cleared.current) {
      cleared.current = true;
      clear();
    }
  }, [fromCheckout, clear]);

  const { data: order, error } = useQuery({
    queryKey: ["me", "orders", id],
    queryFn: () => api<Order>(`/orders/${id}`),
    // The redirect can beat Stripe's webhook by a second or two: poll until it lands.
    refetchInterval: (q) => (fromCheckout && q.state.data?.status === "pending" ? 1500 : false),
  });

  if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return <NotFoundPage />;
  if (!order) {
    return (
      <div className="grid place-items-center py-32 text-text-dim">
        <Spinner className="size-6" />
      </div>
    );
  }

  const address = order.shipping?.address;
  const confirming = fromCheckout && order.status === "pending";

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <Link to="/pedidos" className="text-sm text-text-muted hover:text-text">
        ← Meus pedidos
      </Link>

      {fromCheckout && (
        <div className="mt-6">
          {confirming ? (
            <Alert tone="info">
              <span className="inline-flex items-center gap-2">
                <Spinner /> Confirmando o pagamento com o Stripe…
              </span>
            </Alert>
          ) : order.status === "paid" ? (
            <Alert tone="ok">Pagamento confirmado! Enviamos o resumo do pedido para o seu e-mail.</Alert>
          ) : null}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Pedido <span className="font-mono text-2xl">#{shortId(order.id)}</span>
          </h1>
          <p className="mt-1 text-sm text-text-dim">Feito em {dateTime(order.created_at)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <ul className="mt-8 divide-y divide-border border-y border-border">
        {order.items.map((item) => (
          <li key={item.product_id} className="flex justify-between gap-4 py-4">
            <span>
              {item.quantity}× {item.product_name}
              <span className="block text-sm text-text-muted">{brl(item.unit_price_cents)} cada</span>
            </span>
            <span className="font-medium">{brl(item.unit_price_cents * item.quantity)}</span>
          </li>
        ))}
        <li className="flex justify-between py-4 font-semibold">
          <span>Total</span>
          <span>{brl(order.total_cents)}</span>
        </li>
      </ul>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Entrega</h2>
          {address ? (
            <address className="mt-2 not-italic leading-relaxed">
              {order.shipping?.name}
              <br />
              {address.line1}
              {address.line2 && `, ${address.line2}`}
              <br />
              {address.city} — {address.state}, {address.postal_code}
            </address>
          ) : (
            <p className="mt-2 text-text-dim">Informado no pagamento.</p>
          )}
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Pagamento</h2>
          <p className="mt-2">
            {order.paid_at ? `Aprovado em ${dateTime(order.paid_at)}` : order.status === "pending" ? "Aguardando" : "Não realizado"}
          </p>
          {order.refunded_at && (
            <p className="mt-1 text-text-dim">
              Reembolsado em {dateTime(order.refunded_at)} — o valor volta para o mesmo cartão.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
