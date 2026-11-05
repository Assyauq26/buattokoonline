// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    onError,
    onLoad,
    unoptimized,
  }: {
    alt: string;
    src: string;
    onError?: () => void;
    onLoad?: () => void;
    unoptimized?: boolean;
  }) =>
    React.createElement("img", {
      alt,
      src,
      onError,
      onLoad,
      "data-unoptimized": String(Boolean(unoptimized)),
    }),
}));
const selection = vi.hoisted(() => ({
  image: null as null | { url: string; alt: string },
}));
vi.mock("@/components/storefront/product-selection", () => ({
  useProductSelection: () => selection,
}));
import { ProductGallery } from "@/components/storefront/product-gallery";
vi.stubGlobal("React", React);
afterEach(() => {
  cleanup();
  selection.image = null;
});
it("preserves focus when Home/End move the bounded dot window", () => {
  const images = Array.from({ length: 12 }, (_, i) => ({
    url: `/photo-${i}.webp`,
    alt: `Photo ${i}`,
  }));
  const view = render(
    React.createElement(ProductGallery, { images, name: "Gallery" }),
  );
  const start = view.getByRole("button", {
    name: "Lihat foto produk 1 dari 12",
  });
  start.focus();
  fireEvent.keyDown(start, { key: "End" });
  const end = view.getByRole("button", {
    name: "Lihat foto produk 12 dari 12",
  });
  expect(end).toHaveFocus();
  expect(end).toHaveAttribute("aria-current", "true");
  expect(
    view.container.querySelectorAll(".pdp-gallery-dots button"),
  ).toHaveLength(5);
  fireEvent.keyDown(end, { key: "Home" });
  expect(
    view.getByRole("button", {
      name: "Lihat foto produk 1 dari 12",
    }),
  ).toHaveFocus();
});

it("does not steal option-control focus after repeated boundary keys", () => {
  const images = Array.from({ length: 12 }, (_, i) => ({
    url: `/photo-${i}.webp`,
    alt: `Photo ${i}`,
  }));
  const view = render(
    React.createElement(ProductGallery, { images, name: "Gallery" }),
  );
  fireEvent.keyDown(
    view.getByRole("button", { name: "Lihat foto produk 1 dari 12" }),
    { key: "End" },
  );
  fireEvent.keyDown(
    view.getByRole("button", { name: "Lihat foto produk 12 dari 12" }),
    { key: "End" },
  );
  const option = document.createElement("button");
  document.body.appendChild(option);
  option.focus();
  selection.image = { url: "/option.webp", alt: "Selected option" };
  view.rerender(
    React.createElement(ProductGallery, { images, name: "Gallery" }),
  );
  expect(option).toHaveFocus();
  option.remove();
});

it("shows the first valid cover and a loading state until the image loads", () => {
  const view = render(
    React.createElement(ProductGallery, {
      images: [
        { url: "", alt: "Empty" },
        { url: "javascript:alert(1)", alt: "Invalid" },
        { url: "/cover.webp", alt: "Cover" },
      ],
      name: "Item",
    }),
  );
  expect(view.getByRole("img", { name: "Cover" })).toHaveAttribute(
    "src",
    "/cover.webp",
  );
  expect(view.getByRole("status")).toHaveTextContent("Memuat foto produk");
  fireEvent.load(view.getByRole("img", { name: "Cover" }));
  expect(view.queryByRole("status")).not.toBeInTheDocument();
});

it("recovers from a failed cover and failed option image without a blank hero", () => {
  const images = [
    { url: "/broken.webp", alt: "Broken" },
    { url: "/cover.webp", alt: "Cover" },
  ];
  const view = render(
    React.createElement(ProductGallery, { images, name: "Item" }),
  );
  fireEvent.error(view.getByRole("img", { name: "Broken" }));
  expect(view.getByRole("img", { name: "Cover" })).toHaveAttribute(
    "src",
    "/cover.webp",
  );
  selection.image = { url: "/broken-option.webp", alt: "Option" };
  view.rerender(React.createElement(ProductGallery, { images, name: "Item" }));
  fireEvent.error(view.getByRole("img", { name: "Option" }));
  expect(view.getByRole("img", { name: "Cover" })).toBeInTheDocument();
  fireEvent.error(view.getByRole("img", { name: "Cover" }));
  expect(view.getByText("Foto produk belum tersedia")).toBeInTheDocument();
  expect(view.queryByRole("status")).not.toBeInTheDocument();
});

it("switches option photos, restores the cover without an option, and clamps a shrinking gallery", () => {
  const images = [
    { url: "/cover.webp", alt: "Cover" },
    { url: "/second.webp", alt: "Second" },
  ];
  const view = render(
    React.createElement(ProductGallery, { images, name: "Item" }),
  );
  fireEvent.click(
    view.getByRole("button", { name: "Lihat foto produk 2 dari 2" }),
  );
  selection.image = { url: "/blue.webp", alt: "Blue" };
  view.rerender(React.createElement(ProductGallery, { images, name: "Item" }));
  expect(view.getByRole("img", { name: "Blue" })).toBeInTheDocument();
  selection.image = null;
  view.rerender(React.createElement(ProductGallery, { images, name: "Item" }));
  expect(view.getByRole("img", { name: "Cover" })).toBeInTheDocument();
  fireEvent.click(
    view.getByRole("button", { name: "Lihat foto produk 2 dari 2" }),
  );
  view.rerender(
    React.createElement(ProductGallery, { images: [images[0]], name: "Item" }),
  );
  expect(view.getByRole("img", { name: "Cover" })).toBeInTheDocument();
});

it("renders later image props after an empty gallery and serves published local media directly", () => {
  const view = render(
    React.createElement(ProductGallery, { images: [], name: "Item" }),
  );
  expect(view.getByText("Foto produk belum tersedia")).toBeInTheDocument();
  const images = [
    { url: "/api/v1/product-images/public-photo", alt: "Later cover" },
  ];
  view.rerender(React.createElement(ProductGallery, { images, name: "Item" }));
  expect(view.getByRole("img")).toHaveAttribute("src", images[0].url);
  expect(view.getByRole("img")).toHaveAttribute("data-unoptimized", "true");
  fireEvent.load(view.getByRole("img"));
  expect(view.getByTestId("product-gallery")).toHaveAttribute(
    "aria-busy",
    "false",
  );
});
