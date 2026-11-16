import "server-only";
import { Prisma } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { listProducts, productCardInclude } from "./catalog.service";
import { withCampaignPricing } from "@/modules/promotions/campaign-pricing";
import { toCardData } from "@/components/storefront/product-card";
import { effectivePrice } from "@/lib/money";
import {
  defaultCollections,
  type FashionCollection,
} from "@/modules/appearance/schema";
import { getStorefrontUserContext } from "@/lib/auth/session";
import { fashionWindow } from "./fashion-window";

const pageSize = 12;
const rankedSales = Prisma.sql`FROM "OrderItem" i JOIN "Order" o ON o.id=i."orderId"
  JOIN "ProductVariant" v ON v.id=i."variantId" JOIN "Product" p ON p.id=v."productId"
  WHERE p.status='PUBLISHED' AND o."paymentStatus"='PAID' AND o.status NOT IN ('CANCELLED','EXPIRED','REFUNDED')`;

async function rankedPage(page: number, size: number) {
  const [{ total }] = await prisma.$queryRaw<{ total: number }[]>(
    Prisma.sql`SELECT COUNT(DISTINCT p.id)::int AS total ${rankedSales}`,
  );
  const validPage = Math.max(1, Math.min(page, Math.ceil(total / size)));
  const ids = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT p.id ${rankedSales} GROUP BY p.id ORDER BY SUM(i.quantity) DESC, p.id LIMIT ${size} OFFSET ${(validPage - 1) * size}`,
  );
  const rows = await prisma.product.findMany({
    where: { status: "PUBLISHED", id: { in: ids.map((p) => p.id) } },
    include: productCardInclude,
  });
  const priced = await withCampaignPricing(rows);
  const byId = new Map(priced.map((p) => [p.id, p]));
  return {
    total,
    page: validPage,
    items: ids.flatMap(({ id }) => byId.get(id) ?? []),
  };
}
const readPage = cache(
  async (
    source: FashionCollection["source"],
    category: string,
    page: number,
    size: number,
  ) => {
    const result =
      source === "bestselling"
        ? await rankedPage(page, size)
        : await listProducts({
            categorySlug: source === "category" ? category : undefined,
            featured: source === "featured",
            flashSale: source === "flash",
            sort: "newest",
            page,
            pageSize: size,
          });
    return {
      total: result.total,
      page: result.page,
      items: result.items.map((row) => {
        const card = toCardData(row);
        return {
          id: card.id,
          name: card.name,
          slug: card.slug,
          image: card.image,
          price: effectivePrice(card.basePrice, card.salePrice),
        };
      }),
    };
  },
);

const collectionCount = cache(
  async (source: FashionCollection["source"], category: string) => {
    // Flash eligibility includes active prices and quota; use the catalog's existing check.
    if (source === "flash")
      return (await readPage(source, category, 1, 1)).total;
    if (source === "bestselling") {
      const [row] = await prisma.$queryRaw<{ total: number }[]>(
        Prisma.sql`SELECT COUNT(DISTINCT p.id)::int AS total ${rankedSales}`,
      );
      return row.total;
    }
    return prisma.product.count({
      where: {
        status: "PUBLISHED",
        ...(source === "featured" ? { isFeatured: true } : {}),
        ...(source === "category" ? { category: { slug: category } } : {}),
      },
    });
  },
);

export async function fashionFrame(
  config = defaultCollections,
  selected = "",
  position = 0,
) {
  const preferred = config.find((c) => c.id === selected) ?? config[0];
  const counts = await Promise.all(
    config.map((c) =>
      c === preferred && position < pageSize
        ? readPage(c.source, c.category, 1, pageSize).then((page) => page.total)
        : collectionCount(c.source, c.category),
    ),
  );
  const collections = config.filter((_, i) => counts[i] > 0);
  const collection =
    collections.find((c) => c.id === selected) ?? collections[0];
  if (!collection)
    return { collections, collection: null, total: 0, index: 0, cards: [] };
  const total = counts[config.indexOf(collection)];
  const index = Number.isSafeInteger(position)
    ? Math.max(0, Math.min(total - 1, position))
    : 0;
  const cards = await Promise.all(
    fashionWindow(total, index, 5).map(async ({ offset, pos }) => {
      const page = await readPage(
        collection.source,
        collection.category,
        1 + Math.floor(pos / pageSize),
        pageSize,
      );
      const product = page.items[pos % pageSize];
      return product ? { ...product, offset, pos } : null;
    }),
  );
  const visible = cards.filter((c) => c !== null);
  const user = await getStorefrontUserContext();
  const saved = user
    ? await prisma.wishlistItem.findMany({
        where: {
          wishlist: { userId: user.id },
          productId: { in: visible.map((c) => c.id) },
        },
        select: { productId: true },
      })
    : [];
  const favorites = new Set(saved.map((item) => item.productId));
  return {
    collections,
    collection,
    total,
    index,
    cards: visible.map((card) => ({
      ...card,
      favorite: favorites.has(card.id),
    })),
  };
}
export type FashionFrame = Awaited<ReturnType<typeof fashionFrame>>;
