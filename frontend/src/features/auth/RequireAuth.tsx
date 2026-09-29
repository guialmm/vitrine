import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { Spinner } from "../../components/ui";
import type { Role } from "../../lib/types";
import { useAuth } from "./AuthProvider";

/** UX guard only: the API enforces every permission on its own. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="grid place-items-center py-32 text-text-dim">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-md px-4 py-32 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Acesso restrito</h1>
        <p className="mt-3 text-text-dim">Sua conta não tem permissão para ver esta página.</p>
      </div>
    );
  }
  return children;
}
