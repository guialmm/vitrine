import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Spinner } from "../../components/ui";
import { useAuth } from "../../features/auth/AuthProvider";
import { api } from "../../lib/api";
import type { Role, User } from "../../lib/types";

const ROLES: Record<Role, string> = { customer: "Cliente", staff: "Equipe", admin: "Admin" };

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { data: users, isPending } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api<User[]>("/admin/users"),
  });
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api<User>(`/admin/users/${id}/role`, { method: "PATCH", body: { role } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  return (
    <div>
      <p className="text-sm text-text-dim">
        <strong className="text-text">Equipe</strong> gerencia produtos e pedidos. <strong className="text-text">Admin</strong>{" "}
        também gerencia usuários. A mudança vale na hora, sem precisar sair e entrar de novo.
      </p>
      {setRole.error && (
        <div className="mt-4">
          <Alert>{setRole.error.message}</Alert>
        </div>
      )}
      {isPending && <Spinner className="mt-8 size-6 text-text-dim" />}
      {users && (
        <ul className="mt-6 divide-y divide-border border-y border-border">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">
                  {u.full_name} {u.id === me?.id && <span className="text-xs text-text-muted">(você)</span>}
                </p>
                <p className="text-sm text-text-dim">
                  {u.email} · {u.is_verified ? "e-mail confirmado" : "e-mail não confirmado"}
                </p>
              </div>
              <select
                aria-label={`Papel de ${u.full_name}`}
                className="input w-auto py-2"
                value={u.role}
                disabled={u.id === me?.id || setRole.isPending}
                title={u.id === me?.id ? "Você não pode mudar o próprio papel" : undefined}
                onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value as Role })}
              >
                {Object.entries(ROLES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
