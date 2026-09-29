import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";

import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../lib/api";
import { buttonClass } from "./ui";

function Logo() {
  return (
    <Link to="/" className="font-display text-2xl font-semibold tracking-tight">
      vitrine<span className="text-accent">.</span>
    </Link>
  );
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  `text-sm transition ${isActive ? "text-text" : "text-text-dim hover:text-text"}`;

function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
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
        className="flex items-center gap-2 rounded-full border border-border-strong py-1 pl-1 pr-3 text-sm hover:border-accent"
      >
        <span className="grid size-7 place-items-center rounded-full bg-accent-soft font-semibold text-accent">
          {user.full_name[0]?.toUpperCase()}
        </span>
        <span className="hidden sm:inline">{user.full_name.split(" ")[0]}</span>
      </button>
      {open && (
        <div className="card shadow-tinted absolute right-0 mt-2 w-52 overflow-hidden py-1 text-sm">
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
    <div className="relative z-10 border-b border-accent/20 bg-accent-soft px-4 py-2 text-center text-sm text-accent-strong">
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

export function Layout({ cartSlot }: { cartSlot?: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="bg-decor" aria-hidden />
      <header className="glass-nav sticky top-0 z-30">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <NavLink to="/cafes" className={navLink}>
              Cafés
            </NavLink>
          </div>
          <div className="flex items-center gap-3">
            {cartSlot}
            <AccountMenu />
          </div>
        </nav>
      </header>
      <VerifyBanner />
      <main className="relative z-10 flex-1">
        <Outlet />
      </main>
      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-text-muted sm:flex-row sm:justify-between sm:px-6">
          <p>
            <span className="font-display text-text-dim">vitrine.</span> — cafés especiais brasileiros. Projeto de portfólio.
          </p>
          <p className="font-mono text-xs">FastAPI · React · Stripe · Postgres</p>
        </div>
      </footer>
    </div>
  );
}
