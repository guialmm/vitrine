import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "react-router";

import { CoffeeBag } from "../components/CoffeeBag";
import { Eyebrow, buttonClass } from "../components/ui";
import { api } from "../lib/api";
import type { Page, Product } from "../lib/types";

const FEATURES = [
  ["Torra sob demanda", "Torramos na semana do envio. Nada de café parado em prateleira."],
  ["Rastreável", "Cada pacote traz a fazenda, a altitude e as notas sensoriais."],
  ["Pagamento seguro", "Checkout pelo Stripe — seus dados de cartão nunca passam pela loja."],
];

export function HomePage() {
  const { data } = useQuery({
    queryKey: ["products", "featured"],
    queryFn: () => api<Page<Product>>("/products", { params: { sort: "price_desc", page_size: 24, in_stock: true } }),
  });
  // One coffee per roast (light, medium, dark) so the hero shows the colour range.
  const featured = ["clara", "media", "escura"]
    .map((roast) => data?.items.find((p) => p.roast === roast))
    .filter((p): p is Product => p !== undefined);

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pt-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <Eyebrow>Cafés especiais · safra 2026</Eyebrow>
          <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Do pé de café
            <br />
            <span className="italic text-accent">direto pra sua xícara.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-text-dim">
            Microlotes de fazendas brasileiras, com origem e notas sensoriais em cada pacote.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/cafes" className={buttonClass("primary", "px-6 py-3 text-base")}>
              Ver os cafés
            </Link>
            <Link to="/cafes?category=microlotes" className={buttonClass("outline", "px-6 py-3 text-base")}>
              Microlotes
            </Link>
          </div>
        </motion.div>

        <div className="relative flex h-72 min-w-0 items-end justify-center sm:h-96">
          <div className="absolute inset-x-8 bottom-4 h-40 rounded-full bg-accent-soft blur-3xl" aria-hidden />
          {featured.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: i === 1 ? -24 : 0 }}
              transition={{ delay: 0.2 + i * 0.12, type: "spring", stiffness: 90, damping: 14 }}
              whileHover={{ y: (i === 1 ? -24 : 0) - 10 }}
              className={`relative -mx-[3%] ${i === 1 ? "z-10 w-[38%]" : "w-[32%]"} max-w-56`}
            >
              <Link to={`/cafes/${p.slug}`} aria-label={p.name}>
                <CoffeeBag slug={p.slug} name={p.name} origin={p.origin} roast={p.roast} className="w-full drop-shadow-2xl" />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-bg-elev/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          {FEATURES.map(([title, text], i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <p className="font-mono text-xs text-accent">0{i + 1}</p>
              <h3 className="mt-2 font-display text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-text-dim">{text}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </>
  );
}
