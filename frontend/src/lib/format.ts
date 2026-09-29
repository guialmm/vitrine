const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const brl = (cents: number) => brlFormatter.format(cents / 100);

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const ROAST_LABEL: Record<string, string> = {
  clara: "Torra clara",
  media: "Torra média",
  "media-escura": "Torra média-escura",
  escura: "Torra escura",
};
