import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reviewDisplayName } from "./review-policy";
// One predicate for public list and aggregates. Check current eligibility on read,
// including ownership/product identity and unresolved refunds, not a client badge.
const joins = Prisma.sql`FROM "Review" r
 JOIN "Product" pr ON pr.id=r."productId" AND pr.status='PUBLISHED'
 JOIN "OrderItem" i ON i.id = r."orderItemId"
 JOIN "ProductVariant" v ON v.id = i."variantId" AND v."productId" = r."productId"
 JOIN "Order" o ON o.id = i."orderId" AND o."userId" = r."userId"
 JOIN "Payment" p ON p."orderId" = o.id`;
const eligible = Prisma.sql`r.status = 'PUBLISHED' AND o.status IN ('DELIVERED', 'COMPLETED')
 AND o."paymentStatus" = 'PAID' AND p.status = 'PAID'
 AND NOT EXISTS (SELECT 1 FROM "PaymentEvent" e WHERE e."paymentId" = p.id AND e.type = 'REFUND_REQUESTED'
 AND NOT EXISTS (SELECT 1 FROM "PaymentEvent" resolution WHERE resolution."paymentId" = p.id
 AND resolution.type IN ('REFUND_CONFIRMED', 'REFUND_DECLINED') AND resolution."externalId" = 'refund-resolution:' || e.id))`;
type Db = Prisma.TransactionClient | typeof prisma;
export async function verifiedRatings(ids: string[], db: Db = prisma) {
  if (!ids.length)
    return new Map<string, { ratingAvg: number; reviewCount: number }>();
  const rows = await db.$queryRaw<
    { productId: string; ratingAvg: number; reviewCount: number }[]
  >(Prisma.sql`
    SELECT r."productId", AVG(r.rating)::float8 AS "ratingAvg", COUNT(*)::int AS "reviewCount"
    ${joins} WHERE ${eligible} AND r."productId" IN (${Prisma.join(ids)}) GROUP BY r."productId"`);
  return new Map(
    rows.map((row) => [
      row.productId,
      { ratingAvg: row.ratingAvg, reviewCount: row.reviewCount },
    ]),
  );
}
export async function withVerifiedRatings<T extends { id: string }>(
  products: T[],
  db: Db = prisma,
) {
  const ratings = await verifiedRatings(
    products.map((p) => p.id),
    db,
  );
  return products.map((product) => ({
    ...product,
    ...(ratings.get(product.id) ?? { ratingAvg: 0, reviewCount: 0 }),
  }));
}
export async function readProductReviewSummary(productId: string) {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      rating: number;
      title: string | null;
      body: string;
      createdAt: Date;
      name: string;
      variantLabel: string;
      ratingAvg: number;
      reviewCount: number;
    }[]
  >(Prisma.sql`
    SELECT r.id,r.rating,r.title,r.body,r."createdAt",u.name,i."variantLabel",AVG(r.rating) OVER()::float8 AS "ratingAvg",COUNT(*) OVER()::int AS "reviewCount" ${joins}
    JOIN "User" u ON u.id = r."userId"
    WHERE ${eligible} AND r."productId" = ${productId} ORDER BY r."createdAt" DESC, r.id DESC LIMIT 20`);
  const images = rows.length
    ? await prisma.reviewImage.findMany({
        where: { reviewId: { in: rows.map((row) => row.id) } },
        select: { id: true, url: true, reviewId: true },
        take: 200,
      })
    : [];
  const reviews = rows.map(
    ({ name, ratingAvg: _average, reviewCount: _count, ...row }) => ({
      ...row,
      user: { name: reviewDisplayName(name) },
      images: images
        .filter((image) => image.reviewId === row.id)
        .map(({ id, url }) => ({ id, url })),
    }),
  );
  return {
    reviews,
    ratingAvg: rows[0]?.ratingAvg ?? 0,
    reviewCount: rows[0]?.reviewCount ?? 0,
  };
}
export async function listReviews(productId: string) {
  return (await readProductReviewSummary(productId)).reviews;
}
