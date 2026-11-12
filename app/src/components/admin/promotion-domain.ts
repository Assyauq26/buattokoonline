export type PromotionSku = {
  id: string;
  sku: string;
  label: string;
  regularPrice: number;
  stock: number;
};
export type PromotionProduct = {
  id: string;
  name: string;
  image: string | null;
  regularPrice: number;
  legacy: boolean;
  reason: string | null;
  updatedAt: string;
  variants: PromotionSku[];
};
export type OfferDraft = {
  variantId: string;
  price: string;
  quota: string;
  usedCount?: number;
};
export type ProductDraft = {
  productId: string;
  name: string;
  image: string | null;
  legacy: boolean;
  variants: PromotionSku[];
  offers: OfferDraft[];
};
export type CampaignForm = {
  requestId: string;
  id: string | null;
  version: number;
  name: string;
  start: string;
  end: string;
  items: ProductDraft[];
};
export function offerFieldError(
  value: string,
  key: "price" | "quota",
  sku: PromotionSku,
  required = false,
) {
  if (value === "" && !required) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0)
    return "Isi bilangan bulat positif.";
  if (key === "price" && number >= sku.regularPrice)
    return "Harus di bawah harga normal SKU.";
  if (key === "quota" && number > sku.stock)
    return "Melebihi stok yang tersedia.";
  return null;
}
export const emptyCampaign = (): CampaignForm => ({
  requestId: crypto.randomUUID(),
  id: null,
  version: 0,
  name: "",
  start: "",
  end: "",
  items: [],
});
export const promotionAuditLabel = (action: string) =>
  ({
    "flash-campaign.create": "Kampanye dibuat",
    "flash-campaign.update": "Kampanye diperbarui",
    "flash-campaign.draft-create": "Draf dibuat",
    "flash-campaign.draft-update": "Draf diperbarui",
    "flash-campaign.draft-delete": "Draf dihapus",
    "flash-campaign.end": "Kampanye dibatalkan atau diakhiri",
    "coupon.create": "Voucher dibuat",
    "coupon.update": "Voucher diperbarui",
    "coupon.activate": "Voucher diaktifkan",
    "coupon.deactivate": "Voucher dinonaktifkan",
  })[action] || "Perubahan promosi";
export const statusNames: Record<string, string> = {
  DRAFT: "Draf",
  UPCOMING: "Terjadwal",
  ACTIVE: "Berlangsung",
  ENDED: "Selesai",
  CANCELLED: "Dibatalkan",
};
export function validateOffers(items: ProductDraft[]) {
  if (!items.length) return "Pilih minimal satu produk.";
  for (const p of items) {
    if (!p.offers.length) return `${p.name}: pilih minimal satu SKU.`;
    for (const o of p.offers) {
      const sku = p.variants.find((s) => s.id === o.variantId);
      const price = Number(o.price),
        quota = Number(o.quota);
      if (
        !sku ||
        !Number.isSafeInteger(price) ||
        price <= 0 ||
        price >= sku.regularPrice
      )
        return `${p.name}: harga promo harus positif dan di bawah harga reguler SKU.`;
      if (!Number.isSafeInteger(quota) || quota <= 0 || quota > sku.stock)
        return `${p.name}: kuota harus positif dan tidak melebihi stok SKU.`;
    }
  }
  return null;
}
