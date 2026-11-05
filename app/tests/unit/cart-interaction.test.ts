// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  fireEvent,
  screen,
  act,
  cleanup,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/shop",
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/modules/cart/cart.actions", () => ({ addToCartAction: mocks.add }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => React.createElement("img", { alt }),
}));
import {
  CartInteractionProvider,
  useCartInteraction,
} from "@/components/storefront/cart-interaction-provider";
import type { PurchaseProduct } from "@/modules/catalog/purchase-options";
vi.stubGlobal("React", React);
const product: PurchaseProduct = {
  id: "p",
  slug: "p",
  name: "Product",
  brand: null,
  image: null,
  groups: [],
  variants: [
    {
      id: "v",
      sku: "V",
      available: 5,
      price: 10,
      originalPrice: 10,
      color: null,
      size: null,
      optionValueIds: [],
    },
  ],
};
function Trigger() {
  const c = useCartInteraction();
  return React.createElement(
    "button",
    {
      onClick: (e: React.MouseEvent<HTMLButtonElement>) =>
        void c?.add(product, "v", 2, e.currentTarget),
    },
    "Add",
  );
}
function mount() {
  return render(
    React.createElement(CartInteractionProvider, {
      children: React.createElement(
        "div",
        { className: "storefront-root" },
        React.createElement(Trigger),
      ),
    }),
  );
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it("emits no count or success before confirmation and blocks duplicate requests", async () => {
  let resolve!: (value: unknown) => void;
  mocks.add.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const counts: number[] = [];
  const listener = (e: Event) => counts.push((e as CustomEvent<number>).detail);
  window.addEventListener("store:cart-count", listener);
  try {
    mount();
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(screen.getByText("Add"));
    expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(counts).toEqual([]);
    expect(screen.queryByTestId("cart-success-sheet")).toBeNull();
    await act(async () =>
      resolve({
        ok: true,
        data: {
          count: 7,
          lines: [
            {
              variantId: "v",
              unitPrice: 13,
              variantLabel: "Exact",
              product: { name: "Authoritative", image: null },
            },
          ],
        },
      }),
    );
    expect(await screen.findByTestId("cart-success-sheet")).toHaveTextContent(
      "Authoritative",
    );
    expect(counts).toEqual([7]);
    expect(screen.getByTestId("cart-success-sheet")).toHaveTextContent(
      "2 × Rp 13",
    );
  } finally {
    window.removeEventListener("store:cart-count", listener);
  }
});
it("uncertain responses keep retry safe and never show success", async () => {
  mocks.add.mockRejectedValue(new Error("lost response"));
  mount();
  fireEvent.click(screen.getByText("Add"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Periksa keranjang",
  );
  expect(screen.queryByTestId("cart-success-sheet")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Periksa Keranjang" }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Periksa Keranjang" }));
  expect(mocks.push).toHaveBeenCalledWith("/cart");
  expect(mocks.add).toHaveBeenCalledTimes(1);
});
it("unauthorized mutations retain the existing login continuation", async () => {
  mocks.add.mockResolvedValue({ ok: false, unauthorized: true });
  mount();
  fireEvent.click(screen.getByText("Add"));
  await act(async () => {});
  expect(mocks.push).toHaveBeenCalledWith("/login?redirectTo=/cart");
  expect(screen.queryByTestId("cart-success-sheet")).toBeNull();
});

it("does not blindly replay an ambiguous server error after a possible commit", async () => {
  mocks.add.mockResolvedValue({
    ok: false,
    error: "Terjadi kesalahan. Coba lagi.",
  });
  mount();
  fireEvent.click(screen.getByText("Add"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Periksa keranjang",
  );
  expect(
    screen.getByRole("button", { name: "Periksa Keranjang" }),
  ).toBeEnabled();
  expect(screen.queryByTestId("cart-success-sheet")).toBeNull();
  expect(mocks.add).toHaveBeenCalledTimes(1);
});
