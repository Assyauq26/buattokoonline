import { withCampaignPricing } from "@/modules/promotions/campaign-pricing";
import "server-only";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { effectivePrice } from "@/lib/money";
import { activeScheduledFlashPrice, effectiveProductPrice } from "@/modules/promotions/scheduled-flash-sale";
import {
  MAX_OPTION_GROUPS,
  MAX_OPTION_VALUES,
  MAX_VARIANTS,
} from "./variation-domain";
import { purchaseGroups, type PurchaseProduct } from "./purchase-options";
/** One public, bounded query on demand. Never hydrate every grid card with SKU/media/stock rows. */
export async function getPurchaseOptions(
  slug: string,
): Promise<PurchaseProduct> {
  const raw = await prisma.product.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      name: true,
      optionsEnabled: true,
      basePrice: true,
      salePrice: true,
      isFlashSale: true,
      flashSalePrice: true,
      flashSaleStartsAt: true,
      flashSaleEndsAt: true,
      brand: { select: { name: true } },
      images: {
        where: { isVariation: false },
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { url: true, alt: true },
      },
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        take: MAX_OPTION_GROUPS + 1,
        select: {
          id: true,
          name: true,
          allowsImage: true,
          values: {
            orderBy: { sortOrder: "asc" },
            take: MAX_OPTION_VALUES + 1,
            select: {
              id: true,
              value: true,
              image: { select: { url: true, alt: true } },
            },
          },
        },
      },
      variants: {
        take: MAX_VARIANTS + 1,
        select: {
          id: true,
          sku: true,
          color: true,
          size: true,
          price: true,
          salePrice: true,
          inventory: { select: { onHand: true, reserved: true } },
          optionValues: { select: { valueId: true } },
        },
      },
    },
  });
  if (!raw) throw new HttpError("Produk tidak ditemukan", 404);
  const [p] = await withCampaignPricing([raw]);
  if (
    p.variants.length > MAX_VARIANTS ||
    p.optionGroups.length > MAX_OPTION_GROUPS ||
    p.optionGroups.some((g) => g.values.length > MAX_OPTION_VALUES)
  )
    throw new HttpError("Pilihan produk melebihi batas. Hubungi toko.", 422);
  if (p.optionsEnabled && !p.optionGroups.length)
    throw new HttpError("Pilihan produk belum tersedia", 422);
  const selection = purchaseGroups(
    p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      color: v.color,
      size: v.size,
      available: Math.max(
        0,
        (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0),
      ),
      price:
        activeScheduledFlashPrice(p) ?? (v.price != null
          ? effectivePrice(v.price, v.salePrice)
          : effectiveProductPrice(p)),
      originalPrice: v.price ?? p.basePrice,
      optionValueIds: v.optionValues.map((o) => o.valueId),
    })),
    p.optionsEnabled ? p.optionGroups : [],
  );
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand?.name ?? null,
    image: p.images[0] ?? null,
    ...selection,
  };
}
