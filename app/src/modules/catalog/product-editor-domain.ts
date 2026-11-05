import { combinationKey, type OptionGroup } from "./variation-domain";
import type { ProductInput } from "./product-management.validation";
type Row = ProductInput["variants"][number] & {
  reserved?: number;
  protected?: boolean;
};
const limit = 2_147_483_647;
function ascii(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
function hash(value: string) {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36).toUpperCase().padStart(7, "0");
}
export function suggestSku(
  name: string,
  groups: OptionGroup[],
  ids: string[],
  used: ReadonlySet<string> = new Set(),
) {
  const prefix =
    name
      .trim()
      .split(/\s+/)
      .map((w) => ascii(w).charAt(0))
      .join("") || "PRD";
  const parts = groups.map((g) =>
    ascii(g.values.find((v) => ids.includes(v.id))?.value || ""),
  );
  const stem = [prefix, ...parts].filter(Boolean).join("-");
  const identity = combinationKey(ids);
  let candidate =
    stem.length <= 80 ? stem : `${stem.slice(0, 72)}-${hash(identity)}`;
  let attempt = 0;
  while (used.has(candidate.toUpperCase())) {
    const suffix = `-${hash(identity + ":" + attempt++)}`;
    candidate = stem.slice(0, 80 - suffix.length) + suffix;
  }
  return candidate;
}
export function applyBulk(
  rows: Row[],
  patch: { price?: number; salePrice?: number; onHand?: number },
  selected: ReadonlySet<number> | null,
  basePrice: number,
  canStock: boolean,
): Row[] {
  const keys = Object.keys(patch);
  if (!keys.length) throw new Error("Isi minimal satu field untuk diterapkan.");
  if (selected && !selected.size) throw new Error("Pilih minimal satu SKU.");
  for (const [key, value] of Object.entries(patch)) {
    if (
      !Number.isInteger(value) ||
      value > limit ||
      value < (key === "onHand" ? 0 : 1)
    )
      throw new Error(
        "Harga/stok harus berupa integer dalam batas yang diizinkan.",
      );
  }
  if (patch.onHand !== undefined && !canStock)
    throw new Error("Anda tidak memiliki izin adjustment stok.");
  return rows.map((row, i) => {
    if (selected && !selected.has(i)) return row;
    const next = { ...row, ...patch };
    if (next.salePrice != null && next.salePrice >= (next.price ?? basePrice))
      throw new Error(
        "Harga diskon harus lebih kecil dari harga normal efektif.",
      );
    if (patch.onHand !== undefined && patch.onHand < (row.reserved ?? 0))
      throw new Error("Stok fisik tidak boleh di bawah reservasi.");
    // Existing server contract requires explicit normal price for discounted variants.
    if (patch.salePrice !== undefined && next.price == null)
      next.price = basePrice;
    return next;
  });
}
/** Ignore transport/display metadata, trim form text, preserve meaningful array order. */
export function canonicalProductForm(value: unknown): string {
  const omit = new Set([
    "url",
    "reserved",
    "protected",
    "expectedOnHand",
    "recovered",
  ]);
  const normalize = (x: unknown): unknown => {
    if (typeof x === "string") return x.trim();
    if (Array.isArray(x)) return x.map(normalize);
    if (x && typeof x === "object")
      return Object.fromEntries(
        Object.entries(x)
          .filter(([key, val]) => !omit.has(key) && val !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => [key, normalize(val)]),
      );
    return x;
  };
  return JSON.stringify(normalize(value));
}
