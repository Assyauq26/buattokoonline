import { withCampaignPricing } from "@/modules/promotions/campaign-pricing";
import { prisma } from "@/lib/prisma";

export async function trackView(userId: string, productId: string) {
  await prisma.recentlyViewed.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: { viewedAt: new Date() },
  });
}

export async function getRecentlyViewed(userId: string) {
  const rows=await prisma.recentlyViewed.findMany({
    where: { userId,product:{status:"PUBLISHED"} },
    include: {
      product: {
        include: { images: { orderBy: { sortOrder: "asc" }, take: 1 }, brand: true, variants: { take: 1 } },
      },
    },
    orderBy: { viewedAt: "desc" },
    take: 8,
  });
  const products=await withCampaignPricing(rows.map(r=>r.product));
  return rows.map((r,index)=>({...r,product:products[index]}));
}
