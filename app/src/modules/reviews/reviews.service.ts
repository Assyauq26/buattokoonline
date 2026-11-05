import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { Prisma, ReviewStatus } from "@prisma/client";
import {
  lockOrder,
  assertStaffPermission,
} from "@/modules/orders/transaction-locks";
import {
  activeRefund,
  assertNoActiveRefund,
} from "@/modules/payments/refund-state";
import { writeAudit } from "@/modules/audit/audit.service";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { eligibleReviewOrder, reviewInput } from "./review-policy";
import { verifiedRatings } from "./public-reviews";
export { listReviews } from "./public-reviews";
async function refreshRating(tx: Prisma.TransactionClient, productId: string) {
  const rating = (await verifiedRatings([productId], tx)).get(productId) ?? {
    ratingAvg: 0,
    reviewCount: 0,
  };
  await tx.product.update({ where: { id: productId }, data: rating });
}
export async function reviewableOrderItems(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId, user: { isActive: true } },
    include: {
      payment: true,
      items: {
        include: {
          review: { select: { id: true } },
          variant: { select: { productId: true } },
        },
      },
    },
  });
  if (!order) throw new HttpError("Order tidak ditemukan", 404);
  const eligible =
    eligibleReviewOrder(order) &&
    Boolean(order.payment) &&
    !(await activeRefund(prisma, order.payment!.id));
  return order.items.map((item) => ({
    id: item.id,
    productName: item.productName,
    variantLabel: item.variantLabel,
    imageUrl: item.imageUrl,
    reviewed: Boolean(item.review),
    eligible: eligible && !item.review,
  }));
}
export async function createReview(
  userId: string,
  orderItemId: string,
  input: unknown,
) {
  const parsed = reviewInput.safeParse(input);
  if (!parsed.success) throw new HttpError(parsed.error.issues[0].message, 422);
  return prisma.$transaction(async (tx) => {
    const hint = await tx.orderItem.findFirst({
      where: { id: orderItemId, order: { userId, user: { isActive: true } } },
      select: { orderId: true },
    });
    if (!hint) throw new HttpError("Item pesanan tidak ditemukan", 404);
    await lockOrder(tx, hint.orderId);
    const item = await tx.orderItem.findUniqueOrThrow({
      where: { id: orderItemId },
      include: {
        order: { include: { payment: true } },
        variant: {
          select: { productId: true, product: { select: { slug: true } } },
        },
        review: true,
      },
    });
    if (item.order.userId !== userId)
      throw new HttpError("Item pesanan tidak ditemukan", 404);
    if (!eligibleReviewOrder(item.order))
      throw new HttpError(
        "Ulasan hanya untuk pesanan lunas yang telah diterima",
        409,
      );
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Payment" WHERE id = ${item.order.payment!.id} FOR UPDATE`,
    );
    await assertNoActiveRefund(tx, item.order.payment!.id);
    if (item.review) throw new HttpError("Item ini sudah diulas", 409);
    const productId = item.variant.productId;
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`,
    );
    const review = await tx.review.create({
      data: {
        ...parsed.data,
        title: parsed.data.title || null,
        userId,
        productId,
        orderItemId,
        status: "PUBLISHED",
      },
    });
    await refreshRating(tx, productId);
    await writeAudit(
      {
        userId,
        action: "review.create",
        entity: "Review",
        entityId: review.id,
      },
      tx,
    );
    return {
      id: review.id,
      orderId: item.orderId,
      slug: item.variant.product.slug,
    };
  });
}
// Catalog editors may moderate. Legacy records remain available for moderation,
// but publishing an unlinked legacy row never creates purchase evidence.
export async function setReviewStatus(
  actorId: string,
  id: string,
  status: ReviewStatus,
) {
  if (!Object.values(ReviewStatus).includes(status))
    throw new HttpError("Status tidak valid", 422);
  return prisma.$transaction(async (tx) => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.PRODUCT_UPDATE);
    const row = await tx.review.findUnique({
      where: { id },
      include: { orderItem: { select: { orderId: true } } },
    });
    if (!row) throw new HttpError("Ulasan tidak ditemukan", 404);
    if (row.orderItem) await lockOrder(tx, row.orderItem.orderId);
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Product" WHERE id = ${row.productId} FOR UPDATE`,
    );
    await tx.review.update({ where: { id }, data: { status } });
    await refreshRating(tx, row.productId);
    await writeAudit(
      {
        userId: actorId,
        action: "review.moderate",
        entity: "Review",
        entityId: id,
        meta: { status },
      },
      tx,
    );
  });
}

export async function askQuestion(
  userId: string,
  productId: string,
  body: string,
) {
  if (!body.trim()) throw new HttpError("Pertanyaan tidak boleh kosong", 400);
  return prisma.productQuestion.create({ data: { userId, productId, body } });
}

export async function answerQuestion(
  userId: string,
  questionId: string,
  body: string,
  isOfficial = false,
) {
  if (!body.trim()) throw new HttpError("Jawaban tidak boleh kosong", 400);
  return prisma.productAnswer.create({
    data: { userId, questionId, body, isOfficial },
  });
}
