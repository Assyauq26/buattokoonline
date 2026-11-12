import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { writeAudit } from "@/modules/audit/audit.service";
import { lockCampaignPricing } from "./campaign-pricing";

const schema = z
  .object({
    id: z.string().uuid().nullable(),
    requestId: z.string().uuid().optional(),
    expectedVersion: z.number().int().nonnegative(),
    name: z.string().max(120),
    startsAt: z.string().datetime({ offset: true }).nullable(),
    endsAt: z.string().datetime({ offset: true }).nullable(),
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(64),
            skuOffers: z
              .array(
                z
                  .object({
                    variantId: z.string().min(1).max(64),
                    price: z
                      .number()
                      .int()
                      .nonnegative()
                      .max(2147483647)
                      .nullable(),
                    quota: z
                      .number()
                      .int()
                      .nonnegative()
                      .max(2147483647)
                      .nullable(),
                  })
                  .strict(),
              )
              .max(500),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
type Actor = { id: string; isAdmin: boolean; permissions: string[] };
export async function saveCampaignDraft(actor: Actor, value: unknown) {
  const parsed = schema.safeParse(value);
  if (
    !actor.isAdmin ||
    !actor.permissions.includes(PERMISSIONS.PRODUCT_READ) ||
    !actor.permissions.includes(
      value && typeof value === "object" && "id" in value && value.id
        ? PERMISSIONS.PROMOTION_UPDATE
        : PERMISSIONS.PROMOTION_CREATE,
    )
  )
    throw new HttpError("Izin promosi diperlukan.", 403);
  if (!parsed.success) throw new HttpError("Data draf tidak valid.", 422);
  const input = parsed.data;
  return prisma.$transaction(async (tx) => {
    await lockCampaignPricing(tx, true);
    if (
      !input.id &&
      input.requestId &&
      (await tx.flashSaleCampaign.findUnique({
        where: { id: input.requestId },
        select: { id: true },
      }))
    )
      throw new HttpError(
        "Permintaan draf sudah diterima. Periksa daftar kampanye sebelum mencoba lagi.",
        409,
      );
    const current = input.id
      ? await tx.flashSaleCampaign.findUnique({ where: { id: input.id } })
      : null;
    if (input.id && (!current || current.storeKey !== "primary"))
      throw new HttpError("Kampanye tidak ditemukan.", 404);
    if (
      current &&
      (current.status !== "DRAFT" || current.version !== input.expectedVersion)
    )
      throw new HttpError(
        "Draf berubah atau sudah dijadwalkan. Muat ulang.",
        409,
      );
    const ids = input.items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length)
      throw new HttpError("Produk draf duplikat.", 422);
    if (
      ids.length &&
      (await tx.product.count({ where: { id: { in: ids } } })) !== ids.length
    )
      throw new HttpError("Produk draf tidak ditemukan.", 422);
    const now = new Date();
    // Published columns keep their backwards-compatible NOT NULL contract.
    // Incomplete draft fields live in the separate, non-price-authoritative JSON.
    const startsAt = input.startsAt ? new Date(input.startsAt) : now;
    const requestedEnd = input.endsAt ? new Date(input.endsAt) : null;
    const endsAt =
      requestedEnd && requestedEnd > startsAt
        ? requestedEnd
        : new Date(startsAt.getTime() + 86400000);
    const data = {
      name: input.name.trim() || "Kampanye tanpa nama",
      draft: input as Prisma.InputJsonValue,
      status: "DRAFT",
      startsAt,
      endsAt,
    };
    const row = current
      ? await tx.flashSaleCampaign.update({
          where: { id: current.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.flashSaleCampaign.create({
          data: {
            ...data,
            id: input.requestId ?? randomUUID(),
            storeKey: "primary",
          },
        });
    await writeAudit(
      {
        userId: actor.id,
        entity: "FlashSaleCampaign",
        entityId: row.id,
        action: current
          ? "flash-campaign.draft-update"
          : "flash-campaign.draft-create",
        meta: { version: row.version },
      },
      tx,
    );
    return { id: row.id, version: row.version };
  });
}
export async function deleteCampaignDraft(
  actor: Actor,
  id: string,
  version: number,
) {
  if (
    !actor.isAdmin ||
    !actor.permissions.includes(PERMISSIONS.PROMOTION_UPDATE) ||
    !actor.permissions.includes(PERMISSIONS.PRODUCT_READ)
  )
    throw new HttpError("Izin promosi diperlukan.", 403);
  if (
    !z.string().uuid().safeParse(id).success ||
    !Number.isSafeInteger(version)
  )
    throw new HttpError("Permintaan tidak valid.", 422);
  return prisma.$transaction(async (tx) => {
    await lockCampaignPricing(tx, true);
    const row = await tx.flashSaleCampaign.findFirst({
      where: { id, storeKey: "primary" },
    });
    if (!row) throw new HttpError("Kampanye tidak ditemukan.", 404);
    if (row.status !== "DRAFT" || row.version !== version)
      throw new HttpError(
        "Hanya draf yang belum dijadwalkan dapat dihapus.",
        409,
      );
    await tx.flashSaleCampaign.delete({ where: { id } });
    await writeAudit(
      {
        userId: actor.id,
        entity: "FlashSaleCampaign",
        entityId: id,
        action: "flash-campaign.draft-delete",
        meta: { name: row.name },
      },
      tx,
    );
    return { id };
  });
}
