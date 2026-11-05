import { describe, expect, it } from "vitest";
import { defaultSizeChart, readSizeChart, sizeChartSchema } from "../../src/modules/catalog/product-size-chart";
import { canonicalProductPricing } from "../../src/modules/catalog/product-canonical-pricing";
import { productPublishReadiness } from "../../src/modules/catalog/product-publish-readiness";

describe("bounded size-chart contract", () => {
  it("roundtrips custom text, units and arbitrary parameters", () => {
    const chart = defaultSizeChart(); chart.table.unit = "inch"; chart.table.columns[1].label = "Kapasitas"; chart.table.rows[0].cells.width = "50–55";
    expect(readSizeChart(JSON.parse(JSON.stringify(chart)))).toEqual(chart);
    expect(readSizeChart(null)).toBeNull();
  });
  it("rejects arbitrary URLs, oversized tables, duplicate IDs and missing or unknown cells", () => {
    expect(sizeChartSchema.safeParse({ mode: "image", imageId: "https://evil.test/x" }).success).toBe(false);
    expect(sizeChartSchema.safeParse({ mode: "image", imageId: "owned", url: "https://evil.test" }).success).toBe(false);
    const duplicate = defaultSizeChart(); duplicate.table.columns.push(duplicate.table.columns[0]);
    expect(sizeChartSchema.safeParse(duplicate).success).toBe(false);
    const missing = defaultSizeChart(); delete missing.table.rows[0].cells.width;
    expect(sizeChartSchema.safeParse(missing).success).toBe(false);
    const extra = defaultSizeChart(); extra.table.rows[0].cells.unknown = "1";
    expect(sizeChartSchema.safeParse(extra).success).toBe(false);
    const tooMany = defaultSizeChart(); tooMany.table.rows = Array.from({ length: 51 }, (_, i) => ({ ...tooMany.table.rows[0], id: `row${i}` }));
    expect(sizeChartSchema.safeParse(tooMany).success).toBe(false);
  });
});
describe("canonical variant pricing and publish readiness", () => {
  it("selects cheapest effective SKU without rewriting any SKU prices", () => {
    const input = { optionsEnabled: true, optionGroups: [{}], basePrice: 999, salePrice: null, variants: [{ price: 200, salePrice: 100 }, { price: 150, salePrice: 120 }] };
    const result = canonicalProductPricing(input);
    expect(result.basePrice).toBe(200); expect(result.salePrice).toBe(100); expect(result.variants).toBe(input.variants);
    expect(canonicalProductPricing({ ...input, variants: [{ price: null }] }).basePrice).toBe(999);
    expect(canonicalProductPricing({ ...input, optionsEnabled: false }).basePrice).toBe(999);
  });
  it("uses the domain schema and shipping rules, not visual field presence", () => {
    const input = { name: "Valid", slug: "valid", basePrice: 100, variants: [{ sku: "UNIQUE" }], images: [{ id: "photo" }], weightGrams: 100 };
    expect(productPublishReadiness(input).ready).toBe(true);
    expect(productPublishReadiness({ ...input, weightGrams: null }).ready).toBe(false);
    expect(productPublishReadiness({ ...input, images: [] }).ready).toBe(false);
    expect(productPublishReadiness({ ...input, salePrice: 200 }).ready).toBe(false);
    expect(productPublishReadiness({ ...input, variants: [{ sku: "" }] }).ready).toBe(false);
    expect(productPublishReadiness({ ...input, optionsEnabled: true, optionGroups: [
      { id: "color", name: "Warna", values: [{ id: "red", value: "Merah" }, { id: "blue", value: "Biru" }] },
      { id: "size", name: "Ukuran", values: [{ id: "small", value: "S" }, { id: "large", value: "L" }] },
    ], variants: [{ sku: "SPARSE", optionValueIds: ["red", "large"] }] }).ready).toBe(true);
  });
});
