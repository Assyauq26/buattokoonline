import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SkuOffer = {
  id: string;
  variantId: string;
  productId: string;
  price: number;
  originalPrice: number;
  available: number;
  campaignId: string;
  name: string;
  version: number;
  startsAt: Date;
  endsAt: Date;
};
/** Pending and paid orders consume quota; cancelled/expired orders release it.
 * Refunds remain consumed, exactly like voucher redemption. No mutable counters
 * are reset when an order retries, expires, or changes payment state. */
export async function readSkuOffers(
  ids: string[],
  db: Prisma.TransactionClient = prisma,
  now = new Date(),
) {
  if (!ids.length) return [] as SkuOffer[];
  return db.$queryRaw<SkuOffer[]>(Prisma.sql`
    SELECT s.id,s."variantId",i."productId",s.price,COALESCE(v.price,p."basePrice") AS "originalPrice",
      LEAST(s.quota-COALESCE(used.quantity,0),n."onHand"-n.reserved)::int AS available,
      c.id AS "campaignId",c.name,c.version,c."startsAt",c."endsAt"
    FROM "FlashSaleSkuOffer" s JOIN "FlashSaleCampaignItem" i ON i.id=s."itemId"
    JOIN "FlashSaleCampaign" c ON c.id=i."campaignId"
    JOIN "ProductVariant" v ON v.id=s."variantId" AND v."productId"=i."productId"
    JOIN "Product" p ON p.id=i."productId" JOIN "Inventory" n ON n."variantId"=v.id
    LEFT JOIN LATERAL (SELECT SUM(oi.quantity)::int AS quantity FROM "OrderItem" oi
      JOIN "Order" o ON o.id=oi."orderId" WHERE oi."flashOfferId"=s.id
      AND o.status NOT IN ('CANCELLED','EXPIRED')) used ON true
    WHERE i."productId" IN (${Prisma.join([...new Set(ids)])}) AND c."storeKey"='primary'
      AND c.status='SCHEDULED' AND c."startsAt"<=${now} AND c."endsAt">${now}
      AND p.status='PUBLISHED' AND NOT p."isFlashSale" AND p."flashSalePrice" IS NULL
      AND s.price<(CASE WHEN v.price IS NOT NULL THEN CASE WHEN v."salePrice">0 AND v."salePrice"<v.price THEN v."salePrice" ELSE v.price END
        ELSE CASE WHEN p."salePrice">0 AND p."salePrice"<p."basePrice" THEN p."salePrice" ELSE p."basePrice" END END)
      AND s.quota>COALESCE(used.quantity,0) AND n."onHand">n.reserved
    ORDER BY s.id
  `);
}

export async function lockSkuOffers(
  db: Prisma.TransactionClient,
  ids: string[],
) {
  if (!ids.length) return;
  await db.$queryRaw(Prisma.sql`SELECT s.id FROM "FlashSaleSkuOffer" s
    JOIN "FlashSaleCampaignItem" i ON i.id=s."itemId"
    WHERE i."productId" IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY s.id FOR UPDATE OF s`);
}
