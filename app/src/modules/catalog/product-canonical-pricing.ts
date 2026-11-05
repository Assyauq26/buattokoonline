/** Keep the product fallback aligned with the cheapest explicit SKU, without changing SKU prices. */
export function canonicalProductPricing<T extends { basePrice: number; salePrice?: number | null; optionsEnabled?: boolean; optionGroups?: unknown[]; variants: { price?: number | null; salePrice?: number | null }[] }>(input: T): T {
  if (!input.optionsEnabled || !input.optionGroups?.length || !input.variants.length) return input;
  // Legacy SKUs can inherit a fallback. Preserve it until every row has an explicit price.
  if (input.variants.some(row => !Number.isInteger(row.price) || (row.price ?? 0) < 1)) return input;
  const lowest = input.variants.reduce((best, row) => (row.salePrice ?? row.price!) < (best.salePrice ?? best.price!) ? row : best);
  return { ...input, basePrice: lowest.price!, salePrice: lowest.salePrice ?? null };
}
