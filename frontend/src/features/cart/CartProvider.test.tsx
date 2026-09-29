import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { CartProvider, MAX_QTY, useCart } from "./CartProvider";

const catuai = {
  id: 1,
  slug: "catuai",
  name: "Catuaí",
  origin: "Sul de Minas",
  roast: "media" as const,
  tasting_notes: "caramelo",
  price_cents: 5900,
  stock: 40,
};

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;

beforeEach(() => localStorage.clear());

describe("cart", () => {
  it("merges repeated adds of the same product and caps the quantity", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.add(catuai, 2));
    act(() => result.current.add(catuai, 3));
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.count).toBe(5);

    act(() => result.current.add(catuai, 100));
    expect(result.current.count).toBe(MAX_QTY);
  });

  it("survives a reload through localStorage", () => {
    const first = renderHook(() => useCart(), { wrapper });
    act(() => first.result.current.add(catuai, 3));
    first.unmount();

    const second = renderHook(() => useCart(), { wrapper });
    expect(second.result.current.count).toBe(3);
  });

  it("ignores corrupted storage instead of crashing", () => {
    localStorage.setItem("vitrine:cart", "{not json");
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.lines).toEqual([]);
  });
});
