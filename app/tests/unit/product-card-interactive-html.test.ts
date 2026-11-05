// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/components/ui/navigation", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => React.createElement("img", { alt }),
}));
vi.mock("@/components/storefront/wishlist-button", () => ({
  WishlistButton: () =>
    React.createElement(
      "button",
      { type: "button", "aria-label": "Wishlist" },
      "Wishlist",
    ),
}));
vi.mock("@/components/storefront/quick-add-button", () => ({
  QuickAddButton: () =>
    React.createElement(
      "button",
      { type: "button", "aria-label": "Tambah" },
      "Tambah",
    ),
}));

import { ProductCard } from "@/components/storefront/product-card";

// Isolated Vitest runner transpiles TSX with the classic React JSX runtime.
vi.stubGlobal("React", React);

describe("ProductCard interactive HTML invariants", () => {
  it("renders wishlist control next to the image link, never nested in an anchor", () => {
    const view = render(
      React.createElement(ProductCard, {
        product: {
          id: "p1",
          slug: "shirt",
          name: "Shirt",
          image: null,
          basePrice: 100_000,
          salePrice: null,
          ratingAvg: 0,
          reviewCount: 0,
          variantId: "v1",
        },
      }),
    );
    const document = view.container;
    const wishlist = document.querySelector('button[aria-label="Wishlist"]');
    expect(wishlist).not.toBeNull();
    expect(wishlist?.closest("a")).toBeNull();
    expect(document.querySelector('a[href="/product/shirt"]')).not.toBeNull();
    expect(document.querySelector("a button")).toBeNull();
    expect(
      document.querySelector('button[aria-label="Tambah"]'),
    ).not.toBeNull();
    cleanup();
  });
});

for (const salePrice of [null, 299000])
  it(`featured cards have no purchasing shortcut; sale=${salePrice}`, () => {
    const view = render(
      React.createElement(ProductCard, {
        featured: true,
        product: {
          id: "feature",
          slug: "feature",
          name: "Featured",
          image: null,
          basePrice: 1499000,
          salePrice,
          ratingAvg: 0,
          reviewCount: 0,
          variantId: "v",
        },
      }),
    );
    expect(
      view.container.querySelector('[data-featured="true"]'),
    ).not.toBeNull();
    expect(view.container.querySelectorAll("button")).toHaveLength(0);
    expect(
      view.container.querySelector('[data-theme-role="price"]')?.textContent,
    ).toBe(salePrice === null ? "Rp 1.499.000" : "Rp 299.000");
    cleanup();
  });

describe("discount price arrangement", () => {
  it.each([
    [999_999, 299_000, "inline"],
    [1_000_000, 299_000, "inline"],
    [1_499_000, 1_199_000, "inline"],
    [299_000, null, "single"],
  ] as const)(
    "original %s and sale %s select %s layout",
    (basePrice, salePrice, layout) => {
      const view = render(
        React.createElement(ProductCard, {
          product: {
            id: "price",
            slug: "price",
            name: "Price fixture",
            image: null,
            basePrice,
            salePrice,
            ratingAvg: 0,
            reviewCount: 0,
            variantId: "sku",
          },
        }),
      );
      expect(view.container.querySelector("article")?.dataset.priceLayout).toBe(
        layout,
      );
      expect(
        view.container.querySelectorAll(".product-card-original"),
      ).toHaveLength(salePrice === null ? 0 : 1);
      expect(
        view.container.querySelector(".product-card-purchase > button"),
      ).not.toBeNull();
      cleanup();
    },
  );
});
