import { effectivePrice } from "@/lib/money";

export type ScheduledFlashFields = {
  campaignPriceVerified?: boolean;
  campaignAsOf?: number;
  basePrice: number;
  salePrice: number | null;
  flashSalePrice?: number | null;
  flashSaleStartsAt?: Date | string | null;
  flashSaleEndsAt?: Date | string | null;
};

/**
 * Read-time pricing: scheduled flash sales never overwrite an ordinary salePrice.
 * All storefront and checkout entry points use the same UTC instant semantics:
 * start inclusive, end exclusive. Product has to be published at query time.
 */
export function activeScheduledFlashPrice(
  product: ScheduledFlashFields,
  now = new Date(product.campaignAsOf ?? Date.now()),
): number | null {
  if (product.campaignPriceVerified !== true) return null;
  const price = product.flashSalePrice;
  const start = product.flashSaleStartsAt;
  const end = product.flashSaleEndsAt;
  if (
    price == null ||
    !start ||
    !end ||
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    price >= effectivePrice(product.basePrice, product.salePrice)
  )
    return null;
  const startMs = new Date(start).getTime(),
    endMs = new Date(end).getTime(),
    nowMs = now.getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    !Number.isFinite(nowMs) ||
    startMs >= endMs
  )
    return null;
  return startMs <= nowMs && nowMs < endMs ? price : null;
}

export function effectiveProductPrice(
  product: ScheduledFlashFields,
  now = new Date(product.campaignAsOf ?? Date.now()),
): number {
  return (
    activeScheduledFlashPrice(product, now) ??
    effectivePrice(product.basePrice, product.salePrice)
  );
}
