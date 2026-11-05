/** Optional structured locality; legacy address snapshots keep their old text. */
export function formatAddressLocality(address: {
  village?: string | null;
  district?: string | null;
}): string {
  return [
    address.village?.trim() ? `Desa/Kel. ${address.village.trim()}` : "",
    address.district?.trim() ? `Kec. ${address.district.trim()}` : "",
  ].filter(Boolean).join(", ");
}
