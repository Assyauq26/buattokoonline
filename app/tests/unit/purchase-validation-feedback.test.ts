// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
vi.mock("@/components/appearance/context", () => ({
  useAppearance: () => ({ config: { identity: { name: "Store" } } }),
}));
vi.mock("next/image", () => ({ default: () => null }));
import { QuickAddVariantSheet } from "@/components/storefront/quick-add-variant-sheet";
const product = {
  id: "p",
  slug: "p",
  name: "Product",
  brand: null,
  image: null,
  groups: [
    {
      id: "color",
      name: "Warna",
      allowsImage: false,
      values: [
        { id: "blue", value: "Biru", image: null },
        { id: "red", value: "Merah", image: null },
      ],
    },
    {
      id: "size",
      name: "Ukuran",
      allowsImage: false,
      values: [
        { id: "m", value: "M", image: null },
        { id: "l", value: "L", image: null },
      ],
    },
  ],
  variants: [
    {
      id: "blue-m",
      color: null,
      size: null,
      available: 4,
      price: 10000,
      originalPrice: 10000,
      optionValueIds: ["blue", "m"],
    },
    {
      id: "red-l",
      color: null,
      size: null,
      available: 3,
      price: 11000,
      originalPrice: 11000,
      optionValueIds: ["red", "l"],
    },
  ],
};
afterEach(cleanup);
it("announces incomplete attributes, focuses the missing group and never dispatches cart writes", () => {
  Element.prototype.scrollIntoView = vi.fn();
  const submit = vi.fn();
  render(
    React.createElement(QuickAddVariantSheet, {
      product,
      busy: false,
      error: null,
      uncertain: false,
      onSubmit: submit,
      onCart: vi.fn(),
    }),
  );
  const button = screen.getByRole("button", { name: "Masukkan ke Keranjang" });
  // Quick-add can mount on Shop before product-route styles have ever loaded.
  expect(screen.getByRole("button", { name: "Biru" }).querySelector(".pdp-option-check")).toHaveStyle({ opacity: "0" });
  expect(button).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(button);
  expect(submit).not.toHaveBeenCalled();
  expect(
    screen.getByText("Pilih warna dan ukuran terlebih dahulu."),
  ).toBeVisible();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Biru" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Biru" }));
  expect(screen.getByRole("button", { name: "Biru" }).querySelector(".pdp-option-check")).toHaveStyle({ opacity: "1" });
  fireEvent.click(button);
  expect(screen.getByText("Pilih ukuran terlebih dahulu.")).toBeVisible();
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "M" }));
  expect(button).toHaveAttribute("aria-disabled", "false");
  fireEvent.click(button);
  expect(submit).toHaveBeenCalledExactlyOnceWith("blue-m", 1);
});
it("retains selected options and inline server failure for retry", () => {
  const props = {
    product,
    busy: false,
    error: "Stok berubah",
    uncertain: false,
    onSubmit: vi.fn(),
    onCart: vi.fn(),
    initialOptions: { color: "blue", size: "m" },
  };
  render(React.createElement(QuickAddVariantSheet, props));
  expect(screen.getByRole("alert")).toHaveTextContent("Stok berubah");
  expect(screen.getByRole("button", { name: "Biru" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
