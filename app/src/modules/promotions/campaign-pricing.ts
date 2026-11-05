import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CampaignClock } from "./campaign.validation";
import { HttpError } from "@/lib/http-error";
type Client = Prisma.TransactionClient;
export async function lockCampaignPricing(tx: Client, write = false) {
  const rows = await tx.$queryRaw<{ key: string }[]>(
    Prisma.sql`SELECT "key" FROM "FlashSaleControl" WHERE "key"='primary' ${write ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`}`,
  );
  if (rows.length !== 1)
    throw new HttpError(
      "Pengaturan kampanye belum siap. Coba kembali setelah administrator memeriksanya.",
      503,
    );
}
export async function campaignPrices(
  ids: string[],
  db: Client = prisma,
  now = new Date(),
) {
  if (!ids.length) return [];
  return db.$queryRaw<
    Array<{
      productId: string;
      flashSalePrice: number;
      startsAt: Date;
      endsAt: Date;
      id: string;
      name: string;
      version: number;
    }>
  >(Prisma.sql`
    SELECT i."productId",i."flashSalePrice",c."startsAt",c."endsAt",c.id,c.name,c.version
    FROM "FlashSaleCampaignItem" i JOIN "FlashSaleCampaign" c ON c.id=i."campaignId"
    JOIN "Product" p ON p.id=i."productId"
    WHERE c."storeKey"='primary' AND c.status='SCHEDULED' AND c."startsAt"<=${now} AND c."endsAt">${now}
    AND p.id IN (${Prisma.join([...new Set(ids)])}) AND p.status='PUBLISHED'
    AND NOT p."isFlashSale" AND p."flashSalePrice" IS NULL
    AND i."flashSalePrice"<(CASE WHEN p."salePrice">0 AND p."salePrice"<p."basePrice" THEN p."salePrice" ELSE p."basePrice" END)
    AND NOT EXISTS(SELECT 1 FROM "ProductVariant" v WHERE v."productId"=p.id AND (CASE WHEN v.price IS NOT NULL THEN (CASE WHEN v."salePrice">0 AND v."salePrice"<v.price THEN v."salePrice" ELSE v.price END) ELSE (CASE WHEN p."salePrice">0 AND p."salePrice"<p."basePrice" THEN p."salePrice" ELSE p."basePrice" END) END)<=i."flashSalePrice")
    AND EXISTS(SELECT 1 FROM "ProductVariant" v JOIN "Inventory" n ON n."variantId"=v.id WHERE v."productId"=p.id AND n."onHand">n.reserved)
  `);
}
/** Overlay fresh campaign data OUTSIDE metadata caches. Legacy columns are never a price authority. */
export async function withCampaignPricing<
  T extends {
    id: string;
    basePrice: number;
    salePrice: number | null;
    isFlashSale?: boolean;
  },
>(rows: T[], db: Client = prisma, now = new Date()) {
  const prices = new Map(
    (
      await campaignPrices(
        rows.map((p) => p.id),
        db,
        now,
      )
    ).map((p) => [p.productId, p]),
  );
  return rows.map((p) => {
    const c = prices.get(p.id);
    return {
      ...p,
      salePrice: p.isFlashSale ? null : p.salePrice,
      isFlashSale: Boolean(c),
      flashSalePrice: c?.flashSalePrice ?? null,
      flashSaleStartsAt: c?.startsAt ?? null,
      flashSaleEndsAt: c?.endsAt ?? null,
      campaignPriceVerified: true,
      campaignAsOf: now.getTime(),
      flashCampaign: c
        ? ({
            id: c.id,
            name: c.name,
            status: "SCHEDULED",
            version: c.version,
            startsAt: c.startsAt.toISOString(),
            endsAt: c.endsAt.toISOString(),
            serverNow: now.getTime(),
          } satisfies CampaignClock)
        : null,
    };
  });
}
export async function publicCampaign(): Promise<CampaignClock | null> {
  const now = new Date();
  const current = await prisma.flashSaleCampaign.findFirst({
    where: { storeKey: "primary", status: "SCHEDULED", endsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      version: true,
      startsAt: true,
      endsAt: true,
    },
  });
  const c =
    current ??
    (await prisma.flashSaleCampaign.findFirst({
      where: {
        storeKey: "primary",
        OR: [
          { status: "ENDED" },
          { status: "SCHEDULED", endsAt: { lte: now } },
        ],
      },
      orderBy: { endsAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        version: true,
        startsAt: true,
        endsAt: true,
      },
    }));
  return c
    ? {
        ...c,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        serverNow: now.getTime(),
      }
    : null;
}
