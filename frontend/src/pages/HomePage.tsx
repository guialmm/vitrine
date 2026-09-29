import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { ProductCard } from "../components/ProductCard";
import { ProductPhoto } from "../components/ProductPhoto";
import { buttonClass } from "../components/ui";
import { api } from "../lib/api";
import type { Page, Product } from "../lib/types";

export function HomePage() {
  const { data } = useQuery({
    queryKey: ["products", { sort: "newest", page_size: 24 }],
    queryFn: () => api<Page<Product>>("/products", { params: { page_size: 24 } }),
  });
  const products = data?.items ?? [];
  const hero = products.find((p) => p.slug === "catuai-amarelo") ?? products[0];
  const inStock = products.filter((p) => p.stock > 0);
  const aboutProduct = products.find((p) => p.slug === "geisha-chapada") ?? products[1];

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 sm:px-6 md:grid-cols-2 md:gap-14 md:pt-16">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Café especial brasileiro, torrado toda semana.
          </h1>
          <p className="mt-5 max-w-md text-lg text-text-dim">
            Compramos direto de pequenos produtores de Minas, São Paulo, Bahia e Espírito Santo. Cada pacote
            diz de onde veio o grão e o que esperar na xícara.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/cafes" className={buttonClass("primary", "px-6 py-3")}>
              Comprar cafés
            </Link>
            <Link to="/cafes?category=microlotes" className={buttonClass("outline", "px-6 py-3")}>
              Ver microlotes
            </Link>
          </div>
        </div>
        <div className="overflow-hidden rounded-md">
          {hero ? (
            <ProductPhoto product={hero} kind="table" fit="natural" eager />
          ) : (
            <div className="aspect-[3/2] animate-pulse bg-bg-elev-2" />
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <div className="flex items-end justify-between gap-4 border-b border-border pb-4">
          <h2 className="text-2xl font-extrabold tracking-tight">Cafés da semana</h2>
          <Link to="/cafes" className="text-sm font-medium text-accent hover:underline">
            Ver todos
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
          {inStock.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
          {!data &&
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-md bg-bg-elev-2" />
            ))}
        </div>
      </section>

      <section className="mx-auto mt-24 grid max-w-6xl items-center gap-10 px-4 sm:px-6 md:grid-cols-[2fr_3fr] md:gap-16">
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-md">
          {aboutProduct && <ProductPhoto product={aboutProduct} kind="hand" fit="natural" />}
        </div>
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">Como a gente trabalha</h2>
          <dl className="mt-8 space-y-6">
            {[
              ["Lotes pequenos", "Torramos às segundas só o que foi vendido na semana. O café chega com poucos dias de torra."],
              ["Origem no rótulo", "Região, variedade, torra e notas sensoriais em todo pacote — sem blend misterioso."],
              ["Pagamento pelo Stripe", "O cartão é digitado na página do Stripe; a loja nunca vê nem guarda esses dados."],
            ].map(([title, text]) => (
              <div key={title} className="border-l-2 border-ink pl-4">
                <dt className="font-semibold">{title}</dt>
                <dd className="mt-1 text-text-dim">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
