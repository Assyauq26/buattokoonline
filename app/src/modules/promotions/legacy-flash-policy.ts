type LegacyFields = {
  isFlashSale: boolean;
  salePrice: number | null;
  flashSalePrice: number | null;
  flashSaleStartsAt: Date | null;
  flashSaleEndsAt: Date | null;
};
function utcTimestamp(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return NaN;
  // Product legacy columns are timestamp WITHOUT timezone, persisted as UTC.
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : value + "Z");
}
export function matchesLegacyArchive(snapshot: unknown, p: LegacyFields) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return false;
  const row = snapshot as Record<string, unknown>;
  return (
    row.isFlashSale === p.isFlashSale &&
    row.salePrice === p.salePrice &&
    row.flashSalePrice === p.flashSalePrice &&
    utcTimestamp(row.flashSaleStartsAt) ===
      (p.flashSaleStartsAt?.getTime() ?? null) &&
    utcTimestamp(row.flashSaleEndsAt) === (p.flashSaleEndsAt?.getTime() ?? null)
  );
}
