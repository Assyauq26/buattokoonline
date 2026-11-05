import { resolveVariant, type OptionGroup } from "./variation-domain";
export type PurchaseImage = { url: string; alt: string };
export type PurchaseGroup = Omit<OptionGroup, "values"> & {
  values: { id: string; value: string; image: PurchaseImage | null }[];
};
export type PurchaseVariant = {
  id: string;
  sku?: string;
  color: string | null;
  size: string | null;
  available: number;
  price: number;
  originalPrice: number;
  optionValueIds: string[];
};
export type PurchaseProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  image: PurchaseImage | null;
  groups: PurchaseGroup[];
  variants: PurchaseVariant[];
};
/** Legacy color/size and custom options share the exact-ID resolver. No index-based selection. */
export function purchaseGroups(
  variants: PurchaseVariant[],
  custom: PurchaseGroup[],
): { groups: PurchaseGroup[]; variants: PurchaseVariant[] } {
  if (custom.length) return { groups: custom, variants };
  const groups: PurchaseGroup[] = [];
  for (const [field, name] of [
    ["color", "Warna"],
    ["size", "Ukuran"],
  ] as const) {
    const values = [
      ...new Set(
        variants.map((v) => v[field]).filter((v): v is string => Boolean(v)),
      ),
    ];
    if (values.length)
      groups.push({
        id: field,
        name,
        allowsImage: false,
        values: values.map((value) => ({
          id: `${field}:${value}`,
          value,
          image: null,
        })),
      });
  }
  if (!groups.length && variants.length > 1)
    groups.push({
      id: "sku",
      name: "Pilihan",
      allowsImage: false,
      values: variants.map((v) => ({
        id: `sku:${v.id}`,
        value: v.sku ?? v.id,
        image: null,
      })),
    });
  return {
    groups,
    variants: variants.map((v) => ({
      ...v,
      optionValueIds: groups.map((g) =>
        g.id === "sku"
          ? `sku:${v.id}`
          : `${g.id}:${v[g.id as "color" | "size"] ?? ""}`,
      ),
    })),
  };
}
export function selectedPurchaseVariant(
  product: Pick<PurchaseProduct, "variants" | "groups">,
  options: Record<string, string>,
) {
  if (!product.groups.length)
    return product.variants.length === 1
      ? product.variants.find(() => true)
      : undefined;
  if (
    !product.groups.every((group) =>
      group.values.some((value) => value.id === options[group.id]),
    )
  )
    return undefined;
  return resolveVariant(
    product.variants,
    product.groups.map((g) => options[g.id]).filter(Boolean),
    product.groups.length,
  );
}
export function initialPurchaseOptions(groups: PurchaseGroup[]) {
  // A sole value is unambiguous; multi-choice groups always require an explicit choice.
  return Object.fromEntries(
    groups
      .filter((g) => g.values.length === 1)
      .map((g) => [g.id, g.values[0].id]),
  );
}
export function canChoose(
  product: Pick<PurchaseProduct, "groups" | "variants">,
  options: Record<string, string>,
  groupId: string,
  valueId: string,
) {
  const required = product.groups
    .filter((g) => g.id !== groupId)
    .map((g) => options[g.id])
    .filter(Boolean);
  return product.variants.some(
    (v) =>
      v.available > 0 &&
      v.optionValueIds.includes(valueId) &&
      required.every((id) => v.optionValueIds.includes(id)),
  );
}
export function purchaseImage(
  product: PurchaseProduct,
  options: Record<string, string>,
) {
  return (
    product.groups
      .filter((g) => g.allowsImage)
      .flatMap((g) => g.values)
      .find((v) => Object.values(options).includes(v.id) && v.image)?.image ??
    product.image
  );
}
