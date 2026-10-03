import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { OrderStatusBadge } from "../../components/OrderStatusBadge";
import { Alert, Button, Spinner } from "../../components/ui";
import { useAuth } from "../../features/auth/AuthProvider";
import { api } from "../../lib/api";
import { brl, dateTime } from "../../lib/format";
import type { AdminOrder, OrderStatus } from "../../lib/types";

const FILTERS: [OrderStatus | "", string][] = [
  ["", "Todos"],
  ["paid", "A enviar"],
  ["shipped", "Enviados"],
  ["refunded", "Reembolsados"],
  ["pending", "Aguardando pagamento"],
  ["expired", "Não concluídos"],
];

export function AdminOrdersPage() {
  const [status, setStatus] = useState<OrderStatus | "">("paid");
  const queryClient = useQueryClient();
  const { data: orders, isPending } = useQuery({
    queryKey: ["admin", "orders", status],
    queryFn: () => api<AdminOrder[]>("/admin/orders", { params: { status, limit: 100 } }),
  });
  const { user } = useAuth();
  const ship = useMutation({
    mutationFn: (id: string) => api<AdminOrder>(`/admin/orders/${id}/ship`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
  });
  // Refunds move money: two clicks, the second one showing the amount.
  const [confirming, setConfirming] = useState<string | null>(null);
  const refund = useMutation({
    mutationFn: (id: string) => api<AdminOrder>(`/admin/orders/${id}/refund`, { method: "POST" }),
    onSettled: () => {
      setConfirming(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });
  const canRefund = user?.role === "admin";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${
              status === value ? "border-ink bg-ink text-bg" : "border-border-strong text-text-dim hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {(ship.error || refund.error) && (
        <div className="mt-4">
          <Alert>{(ship.error ?? refund.error)?.message}</Alert>
        </div>
      )}
      {isPending && <Spinner className="mt-8 size-6 text-text-dim" />}
      {orders?.length === 0 && <p className="mt-10 text-text-dim">Nenhum pedido aqui.</p>}

      {orders && orders.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="py-3 font-semibold">Pedido</th>
                <th className="py-3 font-semibold">Cliente</th>
                <th className="py-3 font-semibold">Itens</th>
                <th className="py-3 text-right font-semibold">Total</th>
                <th className="py-3 pl-6 font-semibold">Status</th>
                <th className="py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="py-4">
                    <span className="font-mono">#{o.id.slice(0, 8).toUpperCase()}</span>
                    <span className="block text-xs text-text-muted">{dateTime(o.created_at)}</span>
                  </td>
                  <td className="py-4">
                    {o.shipping?.name ?? "—"}
                    <span className="block text-xs text-text-muted">{o.customer_email}</span>
                    {o.shipping?.address && (
                      <span className="block text-xs text-text-muted">
                        {o.shipping.address.city} — {o.shipping.address.state}
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-text-dim">
                    {o.items.map((i) => (
                      <span key={i.product_id} className="block">
                        {i.quantity}× {i.product_name}
                      </span>
                    ))}
                  </td>
                  <td className="py-4 text-right font-medium">{brl(o.total_cents)}</td>
                  <td className="py-4 pl-6">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="space-y-2 py-4 text-right">
                    {o.status === "paid" && (
                      <Button
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        loading={ship.isPending && ship.variables === o.id}
                        onClick={() => ship.mutate(o.id)}
                      >
                        Marcar como enviado
                      </Button>
                    )}
                    {canRefund && (o.status === "paid" || o.status === "shipped") && (
                      <Button
                        variant="danger"
                        className="px-3 py-1.5 text-xs"
                        loading={refund.isPending && refund.variables === o.id}
                        onClick={() => (confirming === o.id ? refund.mutate(o.id) : setConfirming(o.id))}
                        onBlur={() => setConfirming((c) => (c === o.id && !refund.isPending ? null : c))}
                      >
                        {confirming === o.id ? `Reembolsar ${brl(o.total_cents)}?` : "Reembolsar"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
