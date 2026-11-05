import type { PrismaClient } from "@prisma/client";
export async function assertCampaignSchema(db: PrismaClient) {
  const [row] = await db.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*) AS n FROM pg_constraint WHERE conrelid='public."FlashSaleCampaign"'::regclass AND conname='FlashSaleCampaign_no_overlap' AND contype='x'`;
  if (
    Number(row?.n) !== 1 ||
    !(await db.flashSaleControl.findUnique({ where: { key: "primary" } }))
  )
    throw new Error("Flash campaign schema incomplete");
  // A production rollout cannot silently strand a legacy promotion.
  if (
    await db.product.count({
      where: {
        OR: [
          { isFlashSale: true },
          { flashSalePrice: { not: null } },
          { flashSaleStartsAt: { not: null } },
          { flashSaleEndsAt: { not: null } },
        ],
      },
    })
  )
    throw new Error(
      "Legacy Flash Sale cutover needs reviewed campaign mappings before app switch",
    );
}
