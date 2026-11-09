// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
const mocks = vi.hoisted(() => ({ add: vi.fn(), buy: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/appearance/context", () => ({
  useAppearance: () => ({
    config: { identity: { name: "Store", showWhatsApp: false, whatsapp: "" } },
  }),
}));
vi.mock("@/components/storefront/cart-interaction-provider", () => ({
  useCartInteraction: () => ({ busy: false, add: mocks.add }),
}));
vi.mock("@/modules/checkout/checkout-intent.actions", () => ({
  buyNowAction: mocks.buy,
}));
import { PurchasePanel } from "@/components/storefront/purchase-panel";
const base = { id: "p", slug: "test", name: "Test", brand: null, image: null };
function product(count: number, available = 4) {
  return {
    ...base,
    groups: Array.from({ length: count }, (_, i) => ({
      id: "g" + i,
      name: ["Warna", "Model", "Ukuran"][i],
      allowsImage: false,
      values: [
        { id: "v" + i, value: ["Biru", "Panjang", "XL"][i], image: null },
        { id: "alt" + i, value: "Alternatif " + i, image: null },
      ],
    })),
    variants: [
      {
        id: "variant",
        color: null,
        size: null,
        available,
        price: 20000,
        originalPrice: 25000,
        optionValueIds: Array.from({ length: count }, (_, i) => "v" + i),
      },
      {
        id: "alternative",
        color: null,
        size: null,
        available,
        price: 20000,
        originalPrice: 25000,
        optionValueIds: Array.from({ length: count }, (_, i) => "alt" + i),
      },
    ].slice(0, count ? 2 : 1),
  };
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
for (const count of [1, 2, 3])
  it(`requires all ${count} dynamic attributes for both actions and focuses first missing`, async () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(React.createElement(PurchasePanel, { product: product(count) }));
    const add = screen.getByTestId("add-to-cart-btn");
    fireEvent.click(add);
    expect(mocks.add).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Pilih");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Biru" }),
    );
    for (const value of ["Biru", "Panjang", "XL"].slice(0, count - 1))
      fireEvent.click(screen.getByRole("button", { name: value }));
    fireEvent.click(screen.getByTestId("buy-now-btn"));
    expect(mocks.buy).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: ["Biru", "Panjang", "XL"][count - 1],
      }),
    );
    fireEvent.click(add);
    expect(mocks.add).toHaveBeenCalledWith(
      expect.anything(),
      "variant",
      1,
      expect.anything(),
    );
  });
it("buys a product without attributes directly, locks duplicate requests and preserves inline failure", async () => {
  let finish!: (x: unknown) => void;
  mocks.buy.mockImplementation(() => new Promise((r) => (finish = r)));
  render(React.createElement(PurchasePanel, { product: product(0) }));
  const buy = screen.getByTestId("buy-now-btn");
  fireEvent.click(buy);
  fireEvent.click(buy);
  expect(mocks.buy).toHaveBeenCalledOnce();
  finish({ ok: false, error: "Stok berubah" });
  await screen.findByText("Stok berubah");
  expect(screen.getByTestId("buy-now-btn")).toBeEnabled();
});
it("sold out never submits cart or checkout", () => {
  render(React.createElement(PurchasePanel, { product: product(0, 0) }));
  fireEvent.click(screen.getByTestId("add-to-cart-btn"));
  fireEvent.click(screen.getByTestId("buy-now-btn"));
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.buy).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Stok habis");
});
