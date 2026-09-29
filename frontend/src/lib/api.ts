import type { TokenResponse, User } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// The access token lives only in memory (never localStorage), so an XSS can't
// read it from storage. The refresh token is an httpOnly cookie the JS never sees.
let accessToken: string | null = null;
let onSessionChange: (user: User | null) => void = () => {};

export function subscribeSession(listener: (user: User | null) => void) {
  onSessionChange = listener;
}

export function setSession(session: TokenResponse | null) {
  accessToken = session?.access_token ?? null;
  onSessionChange(session?.user ?? null);
}

let refreshing: Promise<boolean> | null = null;

/** Single-flight: concurrent 401s share one refresh. Firing two refreshes with
 * the same cookie would look like token theft to the backend and log us out. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then(async (r) => {
      setSession(r.ok ? await r.json() : null);
      return r.ok;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, params?: Options["params"]) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== "" && v !== false) qs.set(k, String(v));
  }
  const query = qs.toString();
  return `/api${path}${query ? `?${query}` : ""}`;
}

async function send(path: string, { method = "GET", body, params }: Options) {
  return fetch(buildUrl(path, params), {
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function errorMessage(data: unknown, status: number): string {
  const detail = (data as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  // FastAPI validation errors: [{loc, msg, ...}]
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return `Erro ${status}`;
}

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  let res = await send(path, options);
  // Access tokens last 15 min: on expiry, refresh once and replay the request.
  if (res.status === 401 && accessToken && !path.startsWith("/auth/")) {
    if (await refreshSession()) res = await send(path, options);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status));
  return data as T;
}
