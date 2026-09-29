import { Link } from "react-router";

import { buttonClass } from "../components/ui";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-32 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-3 font-display text-4xl font-semibold">Esse grão não existe</h1>
      <p className="mt-3 text-text-dim">A página que você procurou não está aqui.</p>
      <Link to="/" className={buttonClass("outline", "mt-8")}>
        Voltar ao início
      </Link>
    </div>
  );
}
