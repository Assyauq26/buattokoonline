import { withCampaignPricing } from "@/modules/promotions/campaign-pricing";
import { withVerifiedRatings } from "@/modules/reviews/public-reviews";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";

export async function getOrCreateWishlist(userId: string) {
  return prisma.wishlist.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function toggleWishlist(userId: string, productId: string) {
  const wl = await getOrCreateWishlist(userId);
  const existing = await prisma.wishlistItem.findUnique({
    where: { wishlistId_productId: { wishlistId: wl.id, productId } },
  });
  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    return { active: false };
  }
  if (!await prisma.product.findFirst({ where: { id: productId, status: "PUBLISHED" }, select: { id: true } })) {
    throw new HttpError("Produk tidak ditemukan", 404);
  }
  await prisma.wishlistItem.create({ data: { wishlistId: wl.id, productId } });
  return { active: true };
}

export async function getWishlistView(userId: string) {
  const wl = await prisma.wishlist.findUnique({
    where: { userId },
    include: {
      items: {
        where: { product: { status: "PUBLISHED" } },
        include: {
          product: {
            include: {
              images: { orderBy: { sortOrder: "asc" }, take: 1 },
              brand: true,
              variants: { take: 1 },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  const items = wl?.items ?? [];
  const rated = await withCampaignPricing(await withVerifiedRatings(items.map(item=>item.product)));
  return items.map((item,index)=>({...item,product:rated[index]}));
}

export async function wishlistProductIds(userId: string): Promise<string[]> {
  const wl = await prisma.wishlist.findUnique({
    where: { userId },
    include: { items: { select: { productId: true } } },
  });
  return wl?.items.map((i) => i.productId) ?? [];
}
