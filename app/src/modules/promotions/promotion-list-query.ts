import { z } from "zod";
import type { Prisma } from "@prisma/client";
export const promotionListQuery = z.object({
  id: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  search: z.string().max(160).optional(),
  status: z.string().max(32).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type PromotionListQuery = z.infer<typeof promotionListQuery>;
export const PROMOTION_PAGE_SIZE = 12;
export function campaignListWhere(
  q: PromotionListQuery,
  now = new Date(),
): Prisma.FlashSaleCampaignWhereInput {
  if (q.id) return { id: q.id, storeKey: "primary" };
  const state: Prisma.FlashSaleCampaignWhereInput =
    q.status === "DRAFT"
      ? { status: "DRAFT" }
      : q.status === "CANCELLED"
        ? { status: "CANCELLED" }
        : q.status === "UPCOMING"
          ? { status: "SCHEDULED", startsAt: { gt: now } }
          : q.status === "ACTIVE"
            ? {
                status: "SCHEDULED",
                startsAt: { lte: now },
                endsAt: { gt: now },
              }
            : q.status === "ENDED"
              ? {
                  OR: [
                    { status: "ENDED" },
                    { status: "SCHEDULED", endsAt: { lte: now } },
                  ],
                }
              : {};
  return {
    storeKey: "primary",
    AND: [
      state,
      ...(q.search
        ? [{ name: { contains: q.search, mode: "insensitive" as const } }]
        : []),
      ...(q.from
        ? [{ endsAt: { gte: new Date(q.from + "T00:00:00+07:00") } }]
        : []),
      ...(q.to
        ? [{ startsAt: { lte: new Date(q.to + "T23:59:59.999+07:00") } }]
        : []),
    ],
  };
}
export function voucherListWhere(
  q: PromotionListQuery,
  now = new Date(),
): Prisma.CouponWhereInput {
  if (q.id) return { id: q.id };
  const state: Prisma.CouponWhereInput =
    q.status === "Nonaktif"
      ? { isActive: false }
      : q.status === "Kedaluwarsa"
        ? { isActive: true, expiresAt: { lte: now } }
        : q.status === "Terjadwal"
          ? {
              isActive: true,
              startsAt: { gt: now },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            }
          : ["Aktif", "Kuota habis"].includes(q.status || "")
            ? {
                isActive: true,
                AND: [
                  { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                  { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                ],
              }
            : {};
  return {
    AND: [
      state,
      ...(q.search
        ? [{ code: { contains: q.search, mode: "insensitive" as const } }]
        : []),
    ],
  };
}
