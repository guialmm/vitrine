import type { OrderStatus } from "../lib/types";

const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: "Aguardando pagamento", className: "bg-accent-soft text-accent" },
  paid: { label: "Pago", className: "bg-ok/10 text-ok" },
  shipped: { label: "Enviado", className: "bg-ink text-bg" },
  refunded: { label: "Reembolsado", className: "bg-surface-hover text-text-dim" },
  cancelled: { label: "Cancelado", className: "bg-surface-hover text-text-dim" },
  expired: { label: "Não concluído", className: "bg-surface-hover text-text-dim" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${s.className}`}>{s.label}</span>
  );
}
