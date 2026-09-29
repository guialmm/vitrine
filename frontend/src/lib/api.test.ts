import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api, setSession } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const session = (token: string) => ({
  access_token: token,
  user: { id: "1", email: "a@b.c", full_name: "Ana", role: "customer" as const, is_verified: true },
});

afterEach(() => {
  vi.restoreAllMocks();
  setSession(null);
});

describe("api()", () => {
  it("refreshes an expired token once for concurrent 401s, then replays both requests", async () => {
    setSession(session("expired"));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/auth/refresh") {
        await new Promise((r) => setTimeout(r, 10)); // both 401s arrive while this is in flight
        return json(200, session("fresh"));
      }
      const auth = new Headers(init?.headers).get("Authorization");
      return auth === "Bearer fresh" ? json(200, { url }) : json(401, { detail: "expired" });
    });

    const [a, b] = await Promise.all([api<{ url: string }>("/orders"), api<{ url: string }>("/admin/orders")]);

    expect(a.url).toBe("/api/orders");
    expect(b.url).toBe("/api/admin/orders");
    const refreshes = fetchMock.mock.calls.filter(([u]) => String(u) === "/api/auth/refresh");
    // Two refreshes with the same cookie would look like token theft to the backend.
    expect(refreshes).toHaveLength(1);
  });

  it("surfaces FastAPI error details as ApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(409, { detail: "Not enough stock: Bourbon" }));
    await expect(api("/checkout", { method: "POST", body: {} })).rejects.toEqual(
      new ApiError(409, "Not enough stock: Bourbon"),
    );
  });

  it("drops empty and false params from the query string", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, {}));
    await api("/products", { params: { q: "", roast: "clara", in_stock: false, page: 2, category: null } });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/products?roast=clara&page=2");
  });
});
