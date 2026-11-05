import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";
import type { ProductInput } from "./product-management.validation";
import { canonicalOption, combinationKey, type OptionGroup } from "./variation-domain";

type Tx = Prisma.TransactionClient;
/** Legacy reads are derived from live raw fields: old writers during rollout cannot stale the editor. */
export function legacyOptions(productId: string, variants: { color: string | null; size: string | null }[]) {
  const hash = (value: string) => createHash("md5").update(value).digest("hex");
  return (["color", "size"] as const).flatMap(axis => {
    const unique = new Map<string, string>();
    for (const row of variants) if (row[axis]?.trim()) unique.set(canonicalOption(row[axis]!), row[axis]!.trim());
    if (!unique.size) return [];
    return [{ id: "lg-" + hash(productId + ":" + axis), name: axis === "color" ? "Warna" : "Ukuran", allowsImage: false,
      values: [...unique].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ id: "lv-" + hash(productId + ":" + axis + ":" + key), value, imageId: null })) }];
  });
}
export function legacySelection(productId: string, variant: { color: string | null; size: string | null }) {
  return (["color", "size"] as const).flatMap(axis => variant[axis]?.trim() ? ["lv-" + createHash("md5").update(productId + ":" + axis + ":" + canonicalOption(variant[axis]!)).digest("hex")] : []);
}
export async function writeOptionGroups(tx: Tx, productId: string, input: ProductInput, imageIds: string[]) {
  const groups = input.optionGroups ?? [];
  const groupIds = groups.map(g => g.id), valueIds = groups.flatMap(g => g.values.map(v => v.id));
  const [ownedGroups, ownedValues] = await Promise.all([
    tx.productOptionGroup.findMany({ where: { id: { in: groupIds } } }),
    tx.productOptionValue.findMany({ where: { id: { in: valueIds } } }),
  ]);
  if (ownedGroups.some(g => g.productId !== productId) || ownedValues.some(v => v.productId !== productId || !groups.some(g => g.id === v.groupId && g.values.some(x => x.id === v.id)))) throw new HttpError("Relasi opsi bukan milik produk atau grup ini", 422);
  for (const g of groups) for (const v of g.values) if (v.imageId && !imageIds.includes(v.imageId)) throw new HttpError("Gambar opsi bukan milik produk ini", 422);
  // All rewiring occurs in the same product-version-locked serializable transaction.
  await tx.productVariantOptionValue.deleteMany({ where: { productId } });
  await tx.productOptionValue.updateMany({ where: { productId }, data: { imageId: null } });
  await tx.productOptionGroup.updateMany({ where: { productId }, data: { allowsImage: false } });
  await tx.productOptionValue.deleteMany({ where: { productId, id: { notIn: valueIds } } });
  await tx.productOptionGroup.deleteMany({ where: { productId, id: { notIn: groupIds } } });
  // Temporary unique names allow A↔B renames without dropping stable IDs.
  for (const [i, g] of ownedGroups.entries()) await tx.productOptionGroup.update({ where: { id: g.id }, data: { name: `pending-${g.id}-${i}`, normalizedName: canonicalOption(`pending-${g.id}-${i}`) } });
  for (const [i, v] of ownedValues.entries()) await tx.productOptionValue.update({ where: { id: v.id }, data: { value: `pending-${v.id}-${i}`, normalizedValue: canonicalOption(`pending-${v.id}-${i}`) } });
  for (const [sortOrder, g] of groups.entries()) {
    const data = { name: g.name, normalizedName: canonicalOption(g.name), sortOrder, allowsImage: g.allowsImage };
    await tx.productOptionGroup.upsert({ where: { id: g.id }, create: { ...data, id: g.id, productId }, update: data });
    for (const [valueOrder, v] of g.values.entries()) {
      const data = { value: v.value, normalizedValue: canonicalOption(v.value), sortOrder: valueOrder, imageId: v.imageId || null };
      await tx.productOptionValue.upsert({ where: { id: v.id }, create: { ...data, id: v.id, groupId: g.id, productId }, update: data });
    }
  }
}
export async function writeVariantSelection(tx: Tx, productId: string, variantId: string, groups: OptionGroup[], ids: string[]) {
  if (!groups.length) return;
  await tx.productVariantOptionValue.createMany({ data: groups.map(g => ({ productId, variantId, groupId: g.id, valueId: g.values.find(v => ids.includes(v.id))!.id })) });
}
export async function finishOptions(tx: Tx, productId: string, groups: OptionGroup[], updatedAt: Date) {
  await tx.productOptionValue.deleteMany({ where: { productId, id: { notIn: groups.flatMap(g => g.values.map(v => v.id)) } } });
  await tx.productOptionGroup.deleteMany({ where: { productId, id: { notIn: groups.map(g => g.id) } } });
  await tx.product.update({ where: { id: productId }, data: { optionsEnabled: groups.length > 0, updatedAt } });
}
export function assertStableSelection(productId: string, enabled: boolean, old: { id: string; color: string | null; size: string | null; combinationKey: string | null }, nextIds: string[]) {
  const key = combinationKey(nextIds);
  if (enabled ? old.combinationKey !== key : combinationKey(legacySelection(productId, old)) !== key)
    throw new HttpError("Identitas kombinasi SKU lama tidak boleh diganti. Buat SKU baru dan pertahankan varian dengan stok/riwayat.", 409);
}
