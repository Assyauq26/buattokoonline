import { describe, expect, it } from "vitest";
import { getVariantCombinations } from "@/components/admin/product-variant-builder";

describe("seller product variant combination builder", () => {
  it("creates every color × size combination without mutating existing variants", () => {
    const existing = [{ color: "Merah", size: "M" }];
    const before = structuredClone(existing);
    const result = getVariantCombinations(["Merah", "Hijau"], ["M", "L", "XL"], existing);
    expect(result.missing).toEqual([
      { color: "Merah", size: "L" }, { color: "Merah", size: "XL" },
      { color: "Hijau", size: "M" }, { color: "Hijau", size: "L" }, { color: "Hijau", size: "XL" },
    ]);
    expect(result.exceedsLimit).toBe(false);
    expect(existing).toEqual(before);
  });

  it("does not regenerate an existing variant when case or whitespace differs", () => {
    const result = getVariantCombinations(
      ["MERAH", "Biru"],
      [" m "],
      [{ color: " Merah ", size: "M" }],
    );
    expect(result.missing).toEqual([{ color: "Biru", size: " m " }]);
  });

  it("supports a single attribute without inventing another attribute value", () => {
    expect(getVariantCombinations(["Navy", "Hitam"], [], []).missing).toEqual([
      { color: "Navy", size: "" }, { color: "Hitam", size: "" },
    ]);
    expect(getVariantCombinations([], ["S", "XL"], []).missing).toEqual([
      { color: "", size: "S" }, { color: "", size: "XL" },
    ]);
  });

  it("allows 50 combinations on create when the empty draft placeholder will be replaced", () => {
    const blank = [{ color: "", size: "" }];
    const fiftySizes = Array.from({ length: 50 }, (_, i) => `Size-${i + 1}`);
    expect(getVariantCombinations(["Navy"], fiftySizes, blank, true)).toMatchObject({
      exceedsLimit: false,
    });
    expect(getVariantCombinations(["Navy"], [...fiftySizes, "Size-51"], blank, true)).toMatchObject({
      exceedsLimit: true,
    });
  });

  it("counts manual unsaved rows toward the 50-SKU limit", () => {
    const existing = Array.from({ length: 49 }, (_, i) => ({ color: `C-${i}`, size: "L" }));
    expect(getVariantCombinations(["Red", "Blue"], ["XL"], existing).exceedsLimit).toBe(true);
  });
});
