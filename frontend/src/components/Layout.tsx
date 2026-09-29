import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";

import { useAuth } from "../features/auth/AuthProvider";
import { CartButton } from "../features/cart/components";
import { api } from "../lib/api";
import { buttonClass } from "./ui";

function Logo() {
  return (
    <Link to="/" className="text-xl font-extrabold tracking-[-0.04em]">
      vitrine
    </Link>
  );
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition ${isActive ? "text-text underline underline-offset-8" : "text-text-dim hover:text-text"}`;

function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  // Close on navigation and when the signed-in user changes (logout → login).
  useEffect(() => setOpen(false), [pathname, user?.id]);
  if (!user) {
    return (
      <Link to="/login" className={buttonClass("outline", "py-2")}>
        Entrar
      </Link>
    );
  }
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm hover:bg-surface-hover"
      >
        <span className="grid size-7 place-items-center rounded-full bg-ink text-xs font-semibold text-bg">
          {user.full_name[0]?.toUpperCase()}
        </span>
        <span className="hidden sm:inline">{user.full_name.split(" ")[0]}</span>
      </button>
      {open && (
        <div className="card absolute right-0 mt-2 w-52 overflow-hidden py-1 text-sm shadow-lg shadow-black/5">
          <p className="truncate px-4 py-2 text-xs text-text-muted">{user.email}</p>
          <Link to="/pedidos" className="block px-4 py-2 hover:bg-surface-hover">
            Meus pedidos
          </Link>
          {user.role !== "customer" && (
            <Link to="/admin" className="block px-4 py-2 hover:bg-surface-hover">
              Painel admin
            </Link>
          )}
          <button onClick={logout} className="block w-full px-4 py-2 text-left text-danger hover:bg-surface-hover">
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

function VerifyBanner() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  if (!user || user.is_verified) return null;
  return (
    <div className="border-b border-border bg-accent-soft px-4 py-2 text-center text-sm text-accent">
      Confirme seu e-mail para poder comprar.{" "}
      {sent ? (
        <span className="text-text-dim">Link reenviado — confira sua caixa de entrada.</span>
      ) : (
        <button
          className="font-semibold underline underline-offset-2"
          onClick={() => api("/auth/resend-verification", { method: "POST" }).then(() => setSent(true))}
        >
          Reenviar link
        </button>
      )}
    </div>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <p className="bg-ink px-4 py-2 text-center text-xs text-bg/80">
        Torra às segundas · envio em até 48 h úteis para todo o Brasil
      </p>
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur-sm">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <NavLink to="/cafes" className={navLink}>
              Cafés
            </NavLink>
          </div>
          <div className="flex items-center gap-3">
            <CartButton />
            <AccountMenu />
          </div>
        </nav>
      </header>
      <VerifyBanner />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="mt-24 border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm sm:grid-cols-3 sm:px-6">
          <div>
            <p className="text-lg font-extrabold tracking-[-0.04em]">vitrine</p>
            <p className="mt-2 max-w-xs text-text-dim">
              Cafés especiais de pequenos produtores brasileiros, torrados em lotes pequenos.
            </p>
          </div>
          <div className="text-text-dim">
            <p className="font-semibold text-text">Loja</p>
            <Link to="/cafes" className="mt-2 block hover:text-text">Todos os cafés</Link>
            <Link to="/cafes?category=microlotes" className="mt-1 block hover:text-text">Microlotes</Link>
          </div>
          <div className="text-text-muted">
            <p>Projeto de portfólio — loja fictícia, pagamentos em modo de teste.</p>
            <p className="mt-2">Fotos: Pexels.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
