import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, refreshSession, setSession, subscribeSession } from "../../lib/api";
import type { TokenResponse, User } from "../../lib/types";

interface AuthState {
  user: User | null;
  /** False until the initial cookie-based session restore finishes. */
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { email: string; password: string; full_name: string }) => Promise<void>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    subscribeSession(setUser);
    // A page reload loses the in-memory access token; the refresh cookie
    // silently restores the session.
    refreshSession().finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api<TokenResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setSession(session);
    return session.user;
  }, []);

  const register = useCallback<AuthState["register"]>(async (data) => {
    await api("/auth/register", { method: "POST", body: data });
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setSession(null);
    queryClient.removeQueries({ queryKey: ["me"] });
    queryClient.removeQueries({ queryKey: ["admin"] });
  }, [queryClient]);

  const reloadUser = useCallback(async () => {
    setUser(await api<User>("/auth/me"));
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, register, logout, reloadUser }),
    [user, ready, login, register, logout, reloadUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
