import { describe, it, expect } from "vitest";
import {
  suggestSku,
  applyBulk,
  canonicalProductForm,
} from "@/modules/catalog/product-editor-domain";
import {
  cmToMm,
  weightToGrams,
  mmToCm,
  shippingMetadataSchema,
  assertPublishWeight,
} from "@/modules/catalog/product-shipping";
import { productInputSchema } from "@/modules/catalog/product-management.validation";
const groups = [
  {
    id: "color",
    name: "Warna",
    allowsImage: false,
    values: [{ id: "blue", value: "Birel" }],
  },
  {
    id: "size",
    name: "Ukuran",
    allowsImage: false,
    values: [{ id: "all", value: "All Size" }],
  },
];
describe("editor V2 deterministic SKU and canonical state", () => {
  it("uses initials and all dimensions without random IDs", () => {
    expect(suggestSku("Manset Lengan Panjang", groups, ["blue", "all"])).toBe(
      "MLP-BIREL-ALLSIZE",
    );
  });
  it("normalizes Unicode and strips punctuation safely", () => {
    expect(suggestSku("Été Ｐremium", groups, ["blue", "all"])).toBe(
      "EP-BIREL-ALLSIZE",
    );
    expect(suggestSku("東京", groups, ["blue", "all"])).toBe(
      "PRD-BIREL-ALLSIZE",
    );
  });
  it("resolves collisions deterministically within 80 characters", () => {
    const used = new Set(["MLP-BIREL-ALLSIZE"]);
    const sku = suggestSku(
      "Manset Lengan Panjang",
      groups,
      ["all", "blue"],
      used,
    );
    expect(sku).toMatch(/^MLP-BIREL-ALLSIZE-[A-Z0-9]+$/);
    expect(
      suggestSku("Manset Lengan Panjang", groups, ["blue", "all"], used),
    ).toBe(sku);
    expect(
      suggestSku(
        "A".repeat(160),
        [{ ...groups[0], values: [{ id: "blue", value: "X".repeat(80) }] }],
        ["blue"],
      ).length,
    ).toBeLessThanOrEqual(80);
  });
  it("clean→dirty→restored ignores display/revision details", () => {
    const initial = {
      name: "Produk",
      images: [{ id: "x", alt: "A", url: "/a" }],
      variants: [{ sku: "MANUAL", expectedOnHand: 5, onHand: 5, reserved: 1 }],
    };
    const key = canonicalProductForm(initial);
    expect(canonicalProductForm({ ...initial, name: " Produk " })).toBe(key);
    expect(canonicalProductForm({ ...initial, name: "Produk baru" })).not.toBe(
      key,
    );
    expect(
      canonicalProductForm({
        ...initial,
        images: [{ id: "x", alt: "A", url: "/b" }],
      }),
    ).toBe(key);
  });
  it("photo association and ordering are meaningful", () => {
    expect(
      canonicalProductForm({ images: [{ id: "a" }, { id: "b" }] }),
    ).not.toBe(canonicalProductForm({ images: [{ id: "b" }, { id: "a" }] }));
  });
});
describe("atomic bulk form operation", () => {
  const rows = [
    {
      id: "x",
      color: "",
      size: "",
      sku: "MANUAL",
      price: 100,
      salePrice: 80,
      onHand: 5,
      reserved: 3,
      expectedOnHand: 5,
      protected: true,
    },
    {
      id: "y",
      color: "",
      size: "",
      sku: "OTHER",
      price: null,
      salePrice: null,
      onHand: 2,
      reserved: 0,
      expectedOnHand: 2,
    },
  ];
  it("changes only nonempty fields and selected rows, preserves identity/history", () => {
    const out = applyBulk(rows, { price: 120 }, new Set([0]), 100, true);
    expect(out[0]).toEqual({ ...rows[0], price: 120 });
    expect(out[1]).toBe(rows[1]);
    expect(rows[0].price).toBe(100);
  });
  it("sets absolute stock without changing reservation or expected stock", () => {
    expect(applyBulk(rows, { onHand: 8 }, null, 100, true)[0]).toEqual({
      ...rows[0],
      onHand: 8,
    });
  });
  it("rejects unauthorized stock and stock below reservation atomically", () => {
    expect(() => applyBulk(rows, { onHand: 2 }, null, 100, true)).toThrow(
      "reservasi",
    );
    expect(() => applyBulk(rows, { onHand: 8 }, null, 100, false)).toThrow(
      "izin",
    );
    expect(rows[0].onHand).toBe(5);
  });
  it("validates effective discount and explicit inherited price", () => {
    expect(
      applyBulk(rows, { salePrice: 70 }, new Set([1]), 100, true)[1].price,
    ).toBe(100);
    expect(() => applyBulk(rows, { price: 70 }, null, 100, true)).toThrow(
      "diskon",
    );
  });
  it.each([NaN, Infinity, -1, 1.1, 2147483648])(
    "rejects unsafe number %s",
    (n) => {
      expect(() => applyBulk(rows, { price: n }, null, 100, true)).toThrow();
    },
  );
  it("requires fields and a selected target", () => {
    expect(() => applyBulk(rows, {}, null, 100, true)).toThrow();
    expect(() =>
      applyBulk(rows, { price: 150 }, new Set(), 100, true),
    ).toThrow();
  });
});
describe("shipping exact units and compatibility", () => {
  it.each([
    ["12,5", 125],
    ["12.5", 125],
    ["30", 300],
    ["", null],
  ])("converts %s cm exactly", (cm, mm) => {
    expect(cmToMm(cm)).toBe(mm);
    if (mm !== null) expect(cmToMm(mmToCm(mm))).toBe(mm);
  });
  it.each(["NaN", "Infinity", "-1", "1.23", "1e3", "1,2,3", "0", "10000.1"])(
    "rejects invalid dimensions %s",
    (value) => {
      expect(() => cmToMm(value)).toThrow();
    },
  );
  it("accepts empty drafts and legacy nullable shipping but rejects partial dimensions", () => {
    expect(shippingMetadataSchema.safeParse({}).success).toBe(true);
    expect(
      shippingMetadataSchema.safeParse({
        weightGrams: null,
        packageLengthMm: null,
        packageWidthMm: null,
        packageHeightMm: null,
      }).success,
    ).toBe(true);
    expect(
      shippingMetadataSchema.safeParse({ packageLengthMm: 100 }).success,
    ).toBe(false);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 1000001])(
    "rejects invalid weight %s",
    (weightGrams) => {
      expect(shippingMetadataSchema.safeParse({ weightGrams }).success).toBe(
        false,
      );
    },
  );
  it("publish weight must be present, drafts remain valid", () => {
    expect(() => assertPublishWeight(null)).toThrow("berat");
    expect(() => assertPublishWeight(500)).not.toThrow();
    expect(
      productInputSchema.safeParse({
        name: "Produk",
        slug: "produk",
        basePrice: 100,
        variants: [{ sku: "X" }],
      }).success,
    ).toBe(true);
  });
});

it.each([
  "0",
  "-1",
  "1.1",
  "Infinity",
  "NaN",
  "1e3",
  "1000001",
  "9".repeat(400),
])(
  "rejects invalid/overflow weight text before JSON serialization: %s",
  (value) => {
    expect(() =>
      JSON.stringify({ weightGrams: weightToGrams(value) }),
    ).toThrow();
  },
);
it("weight parser preserves empty null and exact integer grams", () => {
  expect(weightToGrams("")).toBeNull();
  expect(weightToGrams(" 500 ")).toBe(500);
  expect(weightToGrams("1000000")).toBe(1000000);
});
