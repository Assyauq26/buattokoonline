/** Normalize spelling conventions, never guess a different geographic hierarchy. */
export function mappingRegionIdentity(province: string, city: string, district: string) {
  const text = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  const compact = (value: string) => text(value).replace(/[\s.\-'’]/g, "");
  const normalizedCity = text(city)
    .replace(/^kab(?:upaten)?\.?\s+/, "kabupaten ")
    .replace(/^kota\s+adm(?:inistrasi)?\.?\s+/, "kota ");
  return JSON.stringify([compact(province), compact(normalizedCity), compact(district)]);
}
