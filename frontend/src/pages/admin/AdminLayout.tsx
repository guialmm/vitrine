import { NavLink, Outlet } from "react-router";

import { useAuth } from "../../features/auth/AuthProvider";

const tab = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 px-1 pb-3 text-sm font-medium transition ${
    isActive ? "border-ink text-text" : "border-transparent text-text-dim hover:text-text"
  }`;

export function AdminLayout() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Painel</h1>
        <span className="text-sm text-text-muted">
          {user?.full_name} · {user?.role === "admin" ? "admin" : "equipe"}
        </span>
      </div>
      <nav className="mt-6 flex gap-6 border-b border-border">
        <NavLink to="/admin/pedidos" className={tab}>
          Pedidos
        </NavLink>
        <NavLink to="/admin/produtos" className={tab}>
          Produtos
        </NavLink>
        {user?.role === "admin" && (
          <NavLink to="/admin/usuarios" className={tab}>
            Usuários
          </NavLink>
        )}
      </nav>
      <div className="py-8">
        <Outlet />
      </div>
    </div>
  );
}
