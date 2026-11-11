import { expect, it } from "vitest";
import { isSimpleProduct, simpleProductRow } from "@/modules/catalog/product-editor-domain";
import { productInputSchema } from "@/modules/catalog/product-management.validation";
const input = { name: "Produk", slug: "produk", basePrice: 10000, optionsEnabled: false, variantMode: "simple", variants: [{ sku: "SKU-1", color: "", size: "", onHand: 0 }] };
it("membedakan simple dari varian legacy meskipun optionsEnabled false", () => {
  expect(isSimpleProduct(input)).toBe(true);
  expect(isSimpleProduct({ ...input, variants: [{ color: "Hitam" }] })).toBe(false);
  expect(isSimpleProduct({ ...input, variants: [{}, {}] })).toBe(false);
  expect(isSimpleProduct({ ...input, optionsEnabled: true })).toBe(false);
});
it("konversi draft menyimpan ID, stok, snapshot dan SKU pertama tanpa menggabungkan stok", () => {
  const row = { id: "lama", sku: "SKU-LAMA", color: "Hitam", size: "M", optionValueIds: ["a"], price: 10000, salePrice: 9000, onHand: 7, expectedOnHand: 7, reserved: 0 };
  const next = simpleProductRow([row, { sku: "LAIN", color: "", size: "", onHand: 9 }]);
  expect(next).toEqual({ ...row, color: "", size: "", optionValueIds: [], price: null, salePrice: null });
  expect(row.color).toBe("Hitam");
});
it.each([-1, 0, 1.5, NaN, Infinity, 2147483648])("menolak harga invalid %s dalam bahasa Indonesia", basePrice => {
  const result = productInputSchema.safeParse({ ...input, basePrice });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues[0].message).not.toMatch(/^(Too |Invalid|Expected)/);
});
it.each([-1, 1.5, NaN, Infinity, 2147483648])("menolak stok invalid %s", onHand => {
  expect(productInputSchema.safeParse({ ...input, variants: [{ sku: "SKU", onHand }] }).success).toBe(false);
});
it("menolak simple dengan banyak SKU atau opsi tersembunyi", () => {
  expect(productInputSchema.safeParse({ ...input, variants: [{ sku: "A" }, { sku: "B" }] }).success).toBe(false);
  expect(productInputSchema.safeParse({ ...input, variants: [{ sku: "A", color: "Hitam" }] }).success).toBe(false);
  expect(productInputSchema.safeParse({ ...input, variants: [{ sku: "A", optionValueIds: ["hidden"] }] }).success).toBe(false);
});
it("duplikat SKU berbeda kapital diarahkan ke kolom kombinasi kedua", () => {
  const result = productInputSchema.safeParse({ ...input, variantMode: undefined, variants: [{ sku: "Sama" }, { sku: "sama" }] });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues[0].path).toEqual(["variants", 1, "sku"]);
});
