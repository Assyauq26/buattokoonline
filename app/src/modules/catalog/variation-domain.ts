/** Shared bounded domain logic; no React, database, labels or indices as identity. */
export const MAX_OPTION_GROUPS = 3;
export const MAX_OPTION_VALUES = 50;
export const MAX_VARIANTS = 50;
export type OptionValue = { id: string; value: string; imageId?: string | null };
export type OptionGroup = { id: string; name: string; allowsImage: boolean; values: OptionValue[] };
export function canonicalOption(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}
export function combinationKey(valueIds: readonly string[]) {
  return [...valueIds].sort().join("|");
}
export function combinationCount(groups: readonly OptionGroup[]) {
  if (!groups.length) return 0;
  let count = 1;
  for (const group of groups) {
    if (!group.values.length) return 0;
    count *= group.values.length;
    if (count > MAX_VARIANTS) return MAX_VARIANTS + 1;
  }
  return count;
}
export function generateCombinations(groups: readonly OptionGroup[]): string[][] {
  const count = combinationCount(groups);
  if (groups.length > MAX_OPTION_GROUPS || count > MAX_VARIANTS)
    throw new Error("Jumlah kombinasi melebihi batas maksimum 50 SKU. Kurangi beberapa opsi untuk melanjutkan.");
  if (!count) return [];
  return groups.reduce<string[][]>((rows, group) => rows.flatMap(row => group.values.map(value => [...row, value.id])), [[]]);
}
export function optionLabel(groups: readonly OptionGroup[], ids: readonly string[]) {
  return groups.flatMap(group => group.values.filter(value => ids.includes(value.id)).map(value => `${group.name}: ${value.value}`)).join(" / ");
}
export function resolveVariant<T extends { optionValueIds?: readonly string[] }>(variants: readonly T[], ids: readonly string[], groupCount: number) {
  if (!groupCount || ids.length !== groupCount || new Set(ids).size !== groupCount) return undefined;
  const key = combinationKey(ids);
  return variants.find(variant => variant.optionValueIds?.length === groupCount && combinationKey(variant.optionValueIds) === key);
}
