import { z } from "zod";
export const MAX_WEIGHT_GRAMS = 1_000_000;
export const MAX_DIMENSION_MM = 100_000;
const dimension = z
  .number()
  .int()
  .positive()
  .max(MAX_DIMENSION_MM)
  .nullable()
  .optional();
export const shippingMetadataShape = {
  weightGrams: z
    .number()
    .int()
    .positive()
    .max(MAX_WEIGHT_GRAMS)
    .nullable()
    .optional(),
  packageLengthMm: dimension,
  packageWidthMm: dimension,
  packageHeightMm: dimension,
};
export const shippingMetadataSchema = z
  .object(shippingMetadataShape)
  .superRefine((v, ctx) => {
    const dimensions = [v.packageLengthMm, v.packageWidthMm, v.packageHeightMm];
    if (
      dimensions.some((x) => x != null) &&
      !dimensions.every((x) => x != null)
    )
      ctx.addIssue({
        code: "custom",
        path: ["packageLengthMm"],
        message:
          "Lengkapi panjang, lebar, dan tinggi atau kosongkan seluruh dimensi.",
      });
  });
/** Reject overflow before JSON encoding can silently convert Infinity to null. */
export function weightToGrams(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const grams = Number(text);
  if (
    !/^\d+$/.test(text) ||
    !Number.isSafeInteger(grams) ||
    grams <= 0 ||
    grams > MAX_WEIGHT_GRAMS
  )
    throw new Error(
      "Berat paket harus berupa integer positif, maksimal 1.000.000 gram.",
    );
  return grams;
}
/** Exact cm→mm: one decimal place, optional Indonesian decimal comma; no exponent/coercion. */
export function cmToMm(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (!text) return null;
  if (!/^\d+(?:\.\d)?$/.test(text))
    throw new Error("Dimensi harus positif, maksimal satu angka desimal cm.");
  const [whole, decimal = "0"] = text.split(".");
  const mm = Number(whole) * 10 + Number(decimal);
  if (!Number.isSafeInteger(mm) || mm <= 0 || mm > MAX_DIMENSION_MM)
    throw new Error("Dimensi harus lebih dari 0 dan maksimal 10.000 cm.");
  return mm;
}
export function mmToCm(mm: number | null | undefined): string {
  if (mm == null) return "";
  return String(Math.floor(mm / 10)) + (mm % 10 ? `,${mm % 10}` : "");
}
export function assertPublishWeight(weight: number | null | undefined) {
  if (
    !Number.isInteger(weight) ||
    weight == null ||
    weight <= 0 ||
    weight > MAX_WEIGHT_GRAMS
  )
    throw new Error("Isi berat paket sebelum menerbitkan produk.");
}
