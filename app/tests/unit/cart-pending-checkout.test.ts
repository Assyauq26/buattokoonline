// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  fireEvent,
  screen,
  act,
  cleanup,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => React.createElement("img", { alt }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));
vi.mock("@/modules/cart/cart.actions", () => ({
  updateCartItemAction: mocks.update,
  removeCartItemAction: mocks.remove,
}));
import { CartClient } from "@/components/storefront/cart-client";
vi.stubGlobal("React", React);
afterEach(cleanup);
it("blocks checkout until a pending quantity change settles and restores failed optimism", async () => {
  let resolve!: (value: unknown) => void;
  mocks.update.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const initial = {
    lines: [
      {
        id: "line",
        quantity: 1,
        unitPrice: 10000,
        lineTotal: 10000,
        inStock: true,
        availableStock: 5,
        product: { name: "Product", slug: "product", image: null },
        variantLabel: "M",
      },
    ],
    subtotal: 10000,
    count: 1,
  };
  render(React.createElement(CartClient, { initial }));
  fireEvent.click(screen.getByTestId("cart-inc-line"));
  expect(screen.getByTestId("cart-quantity-line")).toHaveTextContent("2");
  expect(screen.getByTestId("checkout-btn")).toBeDisabled();
  fireEvent.click(screen.getByTestId("checkout-btn"));
  expect(mocks.push).not.toHaveBeenCalled();
  await act(async () => resolve({ ok: false, error: "Stock conflict" }));
  expect(screen.getByTestId("cart-quantity-line")).toHaveTextContent("1");
  expect(screen.getByTestId("cart-total")).toHaveTextContent("Rp 10.000");
  expect(screen.getByTestId("checkout-btn")).toBeEnabled();
  expect(screen.getByRole("alert")).toHaveTextContent("Stock conflict");
});
