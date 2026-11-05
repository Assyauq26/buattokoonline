import { describe, it, expect } from "vitest";
import {
  purchaseGroups,
  selectedPurchaseVariant,
  initialPurchaseOptions,
  canChoose,
  purchaseImage,
  type PurchaseVariant,
} from "@/modules/catalog/purchase-options";
const variant = (id: string, ids: string[], stock = 4): PurchaseVariant => ({
  id,
  sku: id,
  color: null,
  size: null,
  price: 120000,
  originalPrice: 150000,
  available: stock,
  optionValueIds: ids,
});
const groups = [
  {
    id: "color",
    name: "Warna",
    allowsImage: true,
    values: [
      { id: "red", value: "Merah", image: { url: "/red.webp", alt: "Merah" } },
      { id: "blue", value: "Biru", image: null },
    ],
  },
  {
    id: "size",
    name: "Ukuran",
    allowsImage: false,
    values: [
      { id: "s", value: "S", image: null },
      { id: "l", value: "L", image: null },
    ],
  },
];
describe("explicit purchase selections", () => {
  it("does not preselect multi-choice or resolve an incomplete, unknown or duplicate selection", () => {
    const p = {
      groups,
      variants: [variant("a", ["red", "s"]), variant("b", ["blue", "l"])],
    };
    expect(initialPurchaseOptions(groups)).toEqual({});
    for (const options of [
      {},
      { color: "red" },
      { color: "red", size: "l" },
      { color: "red", size: "red" },
      { color: "foreign", size: "s" },
    ] as Record<string, string>[])
      expect(selectedPurchaseVariant(p, options)).toBeUndefined();
    expect(selectedPurchaseVariant(p, { color: "blue", size: "l" })?.id).toBe(
      "b",
    );
  });
  it("one actual dimensionless SKU is unambiguous; multiple identical-label SKUs require explicit IDs", () => {
    const one = purchaseGroups([variant("only", [])], []);
    expect(one.groups).toEqual([]);
    expect(selectedPurchaseVariant(one, {})?.id).toBe("only");
    expect(
      selectedPurchaseVariant(
        { groups: [], variants: [variant("a", []), variant("b", [])] },
        {},
      ),
    ).toBeUndefined();
    const multi = purchaseGroups([variant("a", []), variant("b", [])], []);
    expect(multi.groups[0].values.map((v) => v.value)).toEqual(["a", "b"]);
    expect(selectedPurchaseVariant(multi, { sku: "sku:b" })?.id).toBe("b");
  });
  it("normalizes legacy dimensions without a Cartesian-product fallback", () => {
    const p = purchaseGroups(
      [
        { ...variant("a", []), color: "Merah", size: "S" },
        { ...variant("b", []), color: "Biru", size: "L" },
      ],
      [],
    );
    expect(
      selectedPurchaseVariant(p, { color: "color:Merah", size: "size:L" }),
    ).toBeUndefined();
    expect(
      selectedPurchaseVariant(p, { color: "color:Biru", size: "size:L" })?.id,
    ).toBe("b");
  });
  it("disables sparse/stockless combinations while selected values can be cleared", () => {
    const p = {
      groups,
      variants: [variant("a", ["red", "s"]), variant("b", ["blue", "l"], 0)],
    };
    expect(canChoose(p, {}, "color", "blue")).toBe(false);
    expect(canChoose(p, { color: "red" }, "size", "l")).toBe(false);
    expect(canChoose(p, { color: "red" }, "size", "s")).toBe(true);
  });
  it("resolves three groups by value IDs and retains variant-specific price and stock", () => {
    const third = {
      id: "cut",
      name: "Potongan",
      allowsImage: false,
      values: [{ id: "regular", value: "Regular", image: null }],
    };
    const v = {
      ...variant("three", ["l", "regular", "blue"], 2),
      price: 99000,
    };
    const p = { groups: [...groups, third], variants: [v] };
    expect(initialPurchaseOptions(p.groups)).toEqual({ cut: "regular" });
    expect(
      selectedPurchaseVariant(p, { color: "blue", size: "l", cut: "regular" }),
    ).toEqual(v);
  });
  it("uses selected option media with a public cover fallback", () => {
    const p = {
      id: "p",
      slug: "p",
      name: "p",
      brand: null,
      image: { url: "/cover.webp", alt: "Cover" },
      groups,
      variants: [],
    };
    expect(purchaseImage(p, { color: "red" })?.url).toBe("/red.webp");
    expect(purchaseImage(p, { color: "blue" })?.url).toBe("/cover.webp");
  });
});
