import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { flowTabs, flowWhere, terminalCases } from "./flow-state";
export type OrderPageParams = Record<string, string | undefined>;
export async function sellerOrderPage(p: OrderPageParams) {
  // Old bookmarked tabs remain useful, without changing stored historical statuses.
  const alias: Record<string, string> = {
    verify: "payment",
    process: "packing",
    refund: "all",
  };
  const tab = flowTabs.some(([key]) => key === p.tab)
    ? p.tab!
    : alias[p.tab || ""] || "all";
  const q = (p.q || "").trim().slice(0, 200);
  const filters: Prisma.OrderWhereInput[] = [];
  if (q)
    filters.push({
      OR: [
        { orderNumber: { contains: q, mode: "insensitive" } },
        {
          address: {
            is: { recipientName: { contains: q, mode: "insensitive" } },
          },
        },
        { user: { is: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  if (p.refund === "active")
    filters.push({
      resolutions: { some: { state: { notIn: terminalCases } } },
    });
  if (p.shipping === "jnt") filters.push({ shippingMode: "official" });
  if (p.shipping === "manual") filters.push({ shippingMode: "manual" });
  if (p.shipping === "issue")
    filters.push({
      shipment: {
        is: { carrierCondition: { in: ["ISSUE", "RETURNING", "RETURNED"] } },
      },
    });
  if (p.shipping === "pending")
    filters.push({
      jntShipmentRequest: {
        is: { state: { in: ["UNKNOWN", "DISPATCHED", "PREPARED"] } },
      },
    });
  const date = (v?: string) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))
      ? new Date(v + "T00:00:00+07:00")
      : undefined;
  const from = date(p.from),
    to = date(p.to);
  if (from || to)
    filters.push({
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lt: new Date(+to + 86400000) } : {}),
      },
    });
  if (
    p.status &&
    [
      "PAID",
      "PROCESSING",
      "PACKED",
      "SHIPPED",
      "DELIVERED",
      "COMPLETED",
      "CANCELLED",
      "EXPIRED",
      "REFUNDED",
      "PENDING_PAYMENT",
    ].includes(p.status)
  )
    filters.push({ status: p.status as "PAID" });
  return prisma.$transaction(
    async (tx) => {
      const counts: Record<string, number> = {};
      for (const [key] of flowTabs)
        counts[key] = await tx.order.count({
          where: {
            AND: [
              ...filters,
              flowWhere(
                key,
                key === "payment"
                  ? p.paymentState ||
                      (p.tab === "verify" ? "WAITING_VERIFICATION" : undefined)
                  : undefined,
              ),
            ],
          },
        });
      const total = counts[tab],
        page = Math.min(
          Math.max(1, Math.ceil(total / 12)),
          Math.max(1, Number.parseInt(p.page || "1", 10) || 1),
        );
      const rows = await tx.order.findMany({
        where: {
          AND: [
            ...filters,
            flowWhere(
              tab,
              tab === "payment"
                ? p.paymentState ||
                    (p.tab === "verify" ? "WAITING_VERIFICATION" : undefined)
                : undefined,
            ),
          ],
        },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          paymentStatus: true,
          total: true,
          shippingMode: true,
          items: {
            orderBy: { id: "asc" },
            select: {
              variantId: true,
              productName: true,
              quantity: true,
              imageUrl: true,
              variant: { select: { productId: true } },
            },
          },
          address: { select: { recipientName: true } },
          user: { select: { name: true } },
          shipment: {
            select: {
              provider: true,
              status: true,
              cancelledAt: true,
              carrierCondition: true,
              notes: true,
            },
          },
          jntShipmentRequest: {
            select: { state: true, errorCode: true, awb: true },
          },
          resolutions: {
            select: { id: true, state: true, kind: true, refundAmount: true },
          },
        },
        orderBy: [
          { createdAt: p.sort === "oldest" ? "asc" : "desc" },
          { id: "desc" },
        ],
        skip: (page - 1) * 12,
        take: 12,
      });
      return {
        rows,
        total,
        page,
        pages: Math.ceil(total / 12),
        counts,
        tab,
        q,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
