/** Prices are stored as integer Rupiah (no cents). */
export function formatIDR(value: number): string {
  return "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(value));
}

/** Effective unit price given base + optional sale price. */
export function effectivePrice(base: number, sale?: number | null): number {
  return sale != null && sale > 0 && sale < base ? sale : base;
}

export function discountPercent(base: number, sale?: number | null): number {
  if (sale == null || sale <= 0 || sale >= base) return 0;
  return Math.round(((base - sale) / base) * 100);
}
