import {
  withCampaignPricing,
  campaignPrices,
  lockCampaignPricing,
} from "@/modules/promotions/campaign-pricing";
import {
  withVerifiedRatings,
  readProductReviewSummary,
} from "@/modules/reviews/public-reviews";
import { readSizeChart } from "./product-size-chart";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma, ProductStatus } from "@prisma/client";
import { CATALOG_CACHE_TAG } from "./catalog-cache";

// Listing cards only need one image and one variant id. Loading every image,
// every variant and every inventory row for a 12/48 item grid made the RSC
// payload and Prisma response much larger than necessary.
const productCardInclude = {
  images: {
    where: { isVariation: false },
    select: { url: true },
    orderBy: { sortOrder: "asc" },
    take: 1,
  },
  brand: { select: { name: true } },
  variants: { select: { id: true }, take: 1 },
  _count: { select: { variants: true } },
} satisfies Prisma.ProductInclude;

const productDetailInclude = {
  images: { where: { isVariation: false }, orderBy: { sortOrder: "asc" } },
  brand: { select: { name: true, slug: true } },
  category: { select: { id: true, slug: true, name: true } },
  optionGroups: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      allowsImage: true,
      values: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          value: true,
          image: { select: { url: true, alt: true } },
        },
      },
    },
  },
  variants: {
    select: {
      optionValues: { select: { valueId: true } },
      sku: true,
      id: true,
      color: true,
      size: true,
      price: true,
      salePrice: true,
      inventory: { select: { onHand: true, reserved: true } },
    },
  },
  questions: {
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { name: true } },
      answers: {
        select: {
          id: true,
          body: true,
          isOfficial: true,
          user: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  },
} satisfies Prisma.ProductInclude;

export type ProductListParams = {
  categorySlug?: string;
  brandSlug?: string;
  search?: string;
  featured?: boolean;
  flashSale?: boolean;
  sort?: "newest" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
  includeTotal?: boolean;
};

async function listProductsUncached(
  params: ProductListParams,
  client: Prisma.TransactionClient = prisma,
  now = new Date(),
) {
  const requestedPage = params.page ?? 1;
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 100_000)
      : 1;
  const requestedSize = params.pageSize ?? 12;
  const pageSize =
    Number.isSafeInteger(requestedSize) && requestedSize > 0
      ? Math.min(requestedSize, 48)
      : 12;
  const includeTotal = params.includeTotal ?? true;
  const filters: Prisma.ProductWhereInput[] = [];
  if (params.flashSale) {
    const active = await client.$queryRaw<
      { productId: string }[]
    >`SELECT i."productId" FROM "FlashSaleCampaignItem" i JOIN "FlashSaleCampaign" c ON c.id=i."campaignId" WHERE c."storeKey"='primary' AND c.status='SCHEDULED' AND c."startsAt"<=${now} AND c."endsAt">${now}`;
    filters.push({
      id: {
        in: (
          await campaignPrices(
            active.map((i) => i.productId),
            client,
            now,
          )
        ).map((i) => i.productId),
      },
    });
  }
  if (params.search)
    filters.push({
      OR: [
        { name: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
        { brand: { name: { contains: params.search, mode: "insensitive" } } },
      ],
    });
  const where: Prisma.ProductWhereInput = {
    status: ProductStatus.PUBLISHED,
    ...(params.categorySlug ? { category: { slug: params.categorySlug } } : {}),
    ...(params.brandSlug ? { brand: { slug: params.brandSlug } } : {}),
    ...(params.featured ? { isFeatured: true } : {}),
    ...(filters.length ? { AND: filters } : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    params.sort === "price_asc"
      ? { basePrice: "asc" }
      : params.sort === "price_desc"
        ? { basePrice: "desc" }
        : { createdAt: "desc" };

  const [items, total] = await Promise.all([
    client.product.findMany({
      where,
      include: productCardInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    includeTotal ? client.product.count({ where }) : Promise.resolve(0),
  ]);

  const pages = includeTotal ? Math.ceil(total / pageSize) : 0;
  // A valid but out-of-range page still has products. Re-read the true last
  // page instead of rendering an empty list with misleading pager controls.
  if (includeTotal && total > 0 && page > pages) {
    const lastItems = await client.product.findMany({
      where,
      include: productCardInclude,
      orderBy,
      skip: (pages - 1) * pageSize,
      take: pageSize,
    });
    return { items: lastItems, total, page: pages, pageSize, pages };
  }
  return { items, total, page, pageSize, pages };
}

/**
 * Public catalog data is identical for every user, so cache it briefly at the
 * Next.js data layer. Wishlist/auth data remains request/user-specific.
 * Thirty seconds keeps catalog navigation fast without making product changes
 * appear stale for long.
 */
export async function listProducts(params: ProductListParams = {}) {
  const normalized: ProductListParams = {
    categorySlug: params.categorySlug,
    brandSlug: params.brandSlug,
    search: params.search?.trim() || undefined,
    featured: params.featured ?? false,
    flashSale: params.flashSale ?? false,
    sort: params.sort ?? "newest",
    page:
      Number.isSafeInteger(params.page) && (params.page ?? 0) > 0
        ? Math.min(params.page!, 100_000)
        : 1,
    pageSize:
      Number.isSafeInteger(params.pageSize) && (params.pageSize ?? 0) > 0
        ? Math.min(params.pageSize!, 48)
        : 12,
    includeTotal: params.includeTotal ?? true,
  };
  const cacheKey = JSON.stringify(normalized);

  if (normalized.flashSale) {
    const result = await prisma.$transaction(
      async (tx) => {
        await lockCampaignPricing(tx);
        const now = new Date();
        const rows = await listProductsUncached(normalized, tx, now);
        return {
          ...rows,
          items: await withCampaignPricing(rows.items, tx, now),
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 10000 },
    );
    return { ...result, items: await withVerifiedRatings(result.items) };
  }
  const result = await unstable_cache(
    () => listProductsUncached(normalized),
    ["catalog-products", cacheKey],
    { revalidate: normalized.flashSale ? 5 : 30, tags: [CATALOG_CACHE_TAG] },
  )();
  return {
    ...result,
    items: await withCampaignPricing(await withVerifiedRatings(result.items)),
  };
}

/**
 * React request cache prevents generateMetadata() and the page itself from
 * issuing the same expensive product query during one navigation.
 */
export const getProductBySlug = cache(async (slug: string) => {
  const product = await prisma.product.findFirst({
    where: { slug, status: ProductStatus.PUBLISHED },
    include: productDetailInclude,
  });
  if (!product) return null;
  const sizeChart = readSizeChart(product.sizeChart);
  const sizeChartImage =
    sizeChart?.mode === "image"
      ? await prisma.productImage.findFirst({
          where: { id: sizeChart.imageId, productId: product.id },
          select: { url: true, alt: true },
        })
      : null;
  const summary = await readProductReviewSummary(product.id);
  const [priced] = await withCampaignPricing([product]);
  return { ...priced, ...summary, sizeChart, sizeChartImage };
});

export async function getRelatedProducts(product: {
  id: string;
  categoryId: string | null;
}) {
  return withCampaignPricing(
    await withVerifiedRatings(
      await prisma.product.findMany({
        where: {
          status: ProductStatus.PUBLISHED,
          id: { not: product.id },
          ...(product.categoryId ? { categoryId: product.categoryId } : {}),
        },
        include: productCardInclude,
        take: 8,
        orderBy: { createdAt: "desc" },
      }),
    ),
  );
}

export const listCategories = unstable_cache(
  () =>
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        imageUrl: true,
        iconKey: true,
      },
    }),
  ["catalog-categories"],
  { revalidate: 60, tags: [CATALOG_CACHE_TAG] },
);

export const getCategoryBySlug = cache(async (slug: string) => {
  return unstable_cache(
    () => prisma.category.findUnique({ where: { slug } }),
    ["catalog-category", slug],
    { revalidate: 60, tags: [CATALOG_CACHE_TAG] },
  )();
});

export const listBrands = unstable_cache(
  () => prisma.brand.findMany({ orderBy: { name: "asc" } }),
  ["catalog-brands"],
  { revalidate: 60, tags: [CATALOG_CACHE_TAG] },
);

export const getBrandBySlug = cache(async (slug: string) => {
  return unstable_cache(
    () => prisma.brand.findUnique({ where: { slug } }),
    ["catalog-brand", slug],
    { revalidate: 60, tags: [CATALOG_CACHE_TAG] },
  )();
});

export async function searchSuggestions(q: string) {
  if (!q.trim()) return { products: [], brands: [], categories: [] };
  const [products, brands, categories] = await Promise.all([
    prisma.product.findMany({
      where: {
        status: ProductStatus.PUBLISHED,
        name: { contains: q, mode: "insensitive" },
      },
      select: { id: true, name: true, slug: true },
      take: 6,
    }),
    prisma.brand.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { name: true, slug: true },
      take: 4,
    }),
    prisma.category.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { name: true, slug: true },
      take: 4,
    }),
  ]);
  return { products, brands, categories };
}
