import "server-only";
import { matchesLegacyArchive } from "./legacy-flash-policy";
import { effectivePrice } from "@/lib/money";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { writeAudit } from "@/modules/audit/audit.service";
import {
  campaignInputSchema,
  campaignProductQuerySchema,
} from "./campaign.validation";
import { lockCampaignPricing } from "./campaign-pricing";
type Actor = { id: string; isAdmin: boolean; permissions: string[] };
function permit(actor: Actor, permission?: string) {
  if (
    !actor.isAdmin ||
    !actor.permissions.includes(PERMISSIONS.PRODUCT_READ) ||
    (permission
      ? !actor.permissions.includes(permission)
      : ![PERMISSIONS.PROMOTION_CREATE, PERMISSIONS.PROMOTION_UPDATE].some(
          (p) => actor.permissions.includes(p),
        ))
  )
    throw new HttpError("Izin Marketing dan melihat produk diperlukan.", 403);
}
export async function assertCampaignProductEdit(
  tx: Prisma.TransactionClient,
  id: string,
  input: {
    basePrice: number;
    salePrice?: number | null;
    variants: { price?: number | null; salePrice?: number | null }[];
  },
) {
  const rows = await tx.flashSaleCampaignItem.findMany({
    where: {
      productId: id,
      campaign: {
        storeKey: "primary",
        status: { in: ["DRAFT", "SCHEDULED"] },
        endsAt: { gt: new Date() },
      },
    },
    select: { flashSalePrice: true },
  });
  if (
    rows.some(
      (i) =>
        i.flashSalePrice >= effectivePrice(input.basePrice, input.salePrice),
    ) ||
    rows.some((i) =>
      input.variants.some(
        (v) =>
          i.flashSalePrice >=
          (v.price != null
            ? effectivePrice(v.price, v.salePrice)
            : effectivePrice(input.basePrice, input.salePrice)),
      ),
    )
  )
    throw new HttpError(
      "Perubahan harga membuat peserta Flash Sale tidak valid. Kelola kampanye melalui Marketing → Flash Sale.",
      409,
    );
}
export async function saveCampaign(actor: Actor, value: unknown) {
  const parsed = campaignInputSchema.safeParse(value);
  // Authorization precedes looking up any supplied campaign/product identity.
  permit(
    actor,
    value && typeof value === "object" && "id" in value && value.id
      ? PERMISSIONS.PROMOTION_UPDATE
      : PERMISSIONS.PROMOTION_CREATE,
  );
  if (!parsed.success) throw new HttpError(parsed.error.issues[0].message, 422);
  const input = parsed.data;
  if (input.resolveLegacy) permit(actor, PERMISSIONS.PROMOTION_UPDATE);
  try {
    return await prisma.$transaction(
      async (tx) => {
        await lockCampaignPricing(tx, true);
        const now = new Date();
        if (
          input.status === "SCHEDULED" &&
          Date.parse(input.endsAt) <= now.getTime()
        )
          throw new HttpError("Kampanye harus berakhir di masa depan.", 422);
        const current = input.id
          ? await tx.flashSaleCampaign.findFirst({
              where: { id: input.id, storeKey: "primary" },
            })
          : null;
        if (input.id && !current)
          throw new HttpError("Kampanye tidak ditemukan.", 404);
        if (
          current &&
          (current.version !== input.expectedVersion ||
            !["DRAFT", "SCHEDULED"].includes(current.status) ||
            (current.status === "SCHEDULED" && current.endsAt <= now))
        )
          throw new HttpError(
            "Kampanye sudah berubah/berakhir. Muat ulang halaman.",
            409,
          );
        const ids = input.items.map((i) => i.productId).sort();
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
        );
        const products = await tx.product.findMany({
          where: { id: { in: ids } },
          include: { variants: { include: { inventory: true } } },
        });
        if (products.length !== ids.length)
          throw new HttpError("Sebagian produk tidak ditemukan.", 422);
        for (const p of products) {
          const legacy =
            p.isFlashSale ||
            p.flashSalePrice != null ||
            p.flashSaleStartsAt != null ||
            p.flashSaleEndsAt != null;
          if (legacy && !input.resolveLegacy)
            throw new HttpError(
              "Produk memiliki promo legacy. Setujui konversinya melalui Marketing.",
              409,
            );
          const regular = p.isFlashSale
            ? p.basePrice
            : effectivePrice(p.basePrice, p.salePrice);
          const price = input.items.find(
            (i) => i.productId === p.id,
          )!.flashSalePrice;
          if (
            p.status !== "PUBLISHED" ||
            !p.variants.length ||
            p.variants.some(
              (v) =>
                price >=
                (v.price != null
                  ? effectivePrice(v.price, v.salePrice)
                  : regular),
            ) ||
            !p.variants.some(
              (v) => v.inventory && v.inventory.onHand > v.inventory.reserved,
            ) ||
            price >= regular
          )
            throw new HttpError(
              `${p.name}: produk harus terbit, memiliki stok, dan harga promo di bawah harga reguler setiap varian.`,
              422,
            );
          if (legacy) {
            const archived = await tx.flashSaleLegacy.findUnique({
              where: { productId: p.id },
            });
            if (!archived || archived.resolvedCampaignId)
              throw new HttpError(
                "Arsip legacy tidak sesuai; hentikan cutover dan periksa inventaris.",
                409,
              );
            if (!matchesLegacyArchive(archived.snapshot, p))
              throw new HttpError(
                "Promo legacy berubah setelah diarsipkan. Tinjau ulang mapping sebelum cutover.",
                409,
              );
            // Original fields remain in the migration archive. Clear only after explicit validated mapping.
            await tx.product.update({
              where: { id: p.id },
              data: {
                isFlashSale: false,
                flashSalePrice: null,
                flashSaleStartsAt: null,
                flashSaleEndsAt: null,
                ...(p.isFlashSale ? { salePrice: null } : {}),
              },
            });
          }
        }
        const id = current?.id ?? randomUUID();
        const schedule = {
          name: input.name,
          status: input.status,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
        };
        if (
          input.status === "SCHEDULED" &&
          (await tx.flashSaleCampaign.count({
            where: {
              storeKey: "primary",
              id: { not: id },
              status: "SCHEDULED",
              startsAt: { lt: schedule.endsAt },
              endsAt: { gt: schedule.startsAt },
            },
          }))
        )
          throw new HttpError(
            "Jadwal tumpang tindih dengan kampanye lain. Pilih periode berbeda.",
            409,
          );
        const row = current
          ? await tx.flashSaleCampaign.update({
              where: { id },
              data: { ...schedule, version: { increment: 1 } },
            })
          : await tx.flashSaleCampaign.create({
              data: { id, storeKey: "primary", ...schedule },
            });
        await tx.flashSaleCampaignItem.deleteMany({
          where: { campaignId: id },
        });
        await tx.flashSaleCampaignItem.createMany({
          data: input.items.map((i) => ({
            ...i,
            id: randomUUID(),
            campaignId: id,
          })),
        });
        if (input.resolveLegacy)
          await tx.flashSaleLegacy.updateMany({
            where: { productId: { in: ids }, resolvedCampaignId: null },
            data: { resolvedCampaignId: id },
          });
        await writeAudit(
          {
            userId: actor.id,
            entity: "FlashSaleCampaign",
            entityId: id,
            action: current ? "flash-campaign.update" : "flash-campaign.create",
            meta: {
              ...schedule,
              startsAt: schedule.startsAt.toISOString(),
              endsAt: schedule.endsAt.toISOString(),
              version: row.version,
              items: input.items,
              legacyConverted: input.resolveLegacy,
            },
          },
          tx,
        );
        return { id, version: row.version };
      },
      { timeout: 15000 },
    );
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2004", "P2034"].includes(e.code)
    )
      throw new HttpError(
        "Jadwal/data bertabrakan dengan penyimpanan lain. Muat ulang lalu coba lagi.",
        409,
      );
    throw e;
  }
}
export async function endCampaign(actor: Actor, value: unknown) {
  permit(actor, PERMISSIONS.PROMOTION_UPDATE);
  const parsed = z
    .object({ id: z.string().uuid(), expectedVersion: z.number().int().min(0) })
    .strict()
    .safeParse(value);
  if (!parsed.success) throw new HttpError("Permintaan tidak valid.", 422);
  const { id, expectedVersion: version } = parsed.data;
  return prisma.$transaction(async (tx) => {
    await lockCampaignPricing(tx, true);
    const row = await tx.flashSaleCampaign.findFirst({
      where: { id, storeKey: "primary" },
    });
    if (!row) throw new HttpError("Kampanye tidak ditemukan.", 404);
    if (row.version !== version || !["DRAFT", "SCHEDULED"].includes(row.status))
      throw new HttpError("Kampanye telah berubah. Muat ulang.", 409);
    const status =
      row.startsAt > new Date() || row.status === "DRAFT"
        ? "CANCELLED"
        : "ENDED";
    await tx.flashSaleCampaign.update({
      where: { id },
      data: { status, version: { increment: 1 } },
    });
    await writeAudit(
      {
        userId: actor.id,
        entity: "FlashSaleCampaign",
        entityId: id,
        action: "flash-campaign.end",
        meta: { status, previousVersion: version },
      },
      tx,
    );
    return { id };
  });
}
/** Explicit archival retirement for expired/manual legacy promos that must not be rescheduled. */
export async function retireLegacy(actor: Actor, value: unknown) {
  permit(actor, PERMISSIONS.PROMOTION_UPDATE);
  const parsed = z
    .object({
      productId: z.string().min(1).max(64),
      expectedUpdatedAt: z.string().datetime({ offset: true }),
      retainManualPriceAsRegular: z.literal(true).optional(),
    })
    .strict()
    .safeParse(value);
  if (!parsed.success)
    throw new HttpError("Permintaan konversi tidak valid.", 422);
  if (parsed.data.retainManualPriceAsRegular)
    permit(actor, PERMISSIONS.PRODUCT_UPDATE);
  return prisma.$transaction(async (tx) => {
    await lockCampaignPricing(tx, true);
    const { productId, expectedUpdatedAt } = parsed.data;
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Product" WHERE id=${productId} FOR UPDATE`,
    );
    const p = await tx.product.findUnique({ where: { id: productId } });
    if (!p) throw new HttpError("Produk tidak ditemukan.", 404);
    if (p.updatedAt.toISOString() !== expectedUpdatedAt)
      throw new HttpError("Data produk telah berubah. Muat ulang.", 409);
    const archive = await tx.flashSaleLegacy.findUnique({
      where: { productId },
    });
    if (!archive || archive.resolvedCampaignId)
      throw new HttpError(
        "Arsip legacy tidak tersedia/konversi sudah selesai.",
        409,
      );
    if (!matchesLegacyArchive(archive.snapshot, p))
      throw new HttpError(
        "Promo legacy berubah. Tinjau ulang arsip sebelum cutover.",
        409,
      );
    // Explicit business approval only: retain the archived manual amount as a
    // regular discount in the SAME locked transaction as legacy retirement.
    // The mapping cannot supply an arbitrary replacement price.
    const retainRegularPrice = parsed.data.retainManualPriceAsRegular === true;
    if (
      retainRegularPrice &&
      (!p.isFlashSale ||
        p.salePrice == null ||
        p.salePrice <= 0 ||
        p.salePrice >= p.basePrice)
    )
      throw new HttpError(
        "Harga diskon manual tidak valid untuk dipertahankan.",
        422,
      );
    await tx.product.update({
      where: { id: productId },
      data: {
        isFlashSale: false,
        flashSalePrice: null,
        flashSaleStartsAt: null,
        flashSaleEndsAt: null,
        ...(p.isFlashSale && !retainRegularPrice ? { salePrice: null } : {}),
      },
    });
    await writeAudit(
      {
        userId: actor.id,
        entity: "Product",
        entityId: productId,
        action: "flash-campaign.legacy-retire",
        meta: {
          archived: true,
          retainManualPriceAsRegular: retainRegularPrice,
          previousSalePrice: p.salePrice,
          regularSalePrice:
            p.isFlashSale && !retainRegularPrice ? null : p.salePrice,
        },
      },
      tx,
    );
    return { productId };
  });
}
export async function listCampaigns(actor: Actor) {
  permit(actor);
  const include = {
    items: {
      include: {
        product: {
          select: {
            id: true,
            name: true,
            basePrice: true,
            salePrice: true,
            status: true,
            variants: {
              select: {
                price: true,
                salePrice: true,
                inventory: { select: { onHand: true, reserved: true } },
              },
            },
          },
        },
      },
    },
  } satisfies Prisma.FlashSaleCampaignInclude;
  const [recent, relevant] = await Promise.all([
    prisma.flashSaleCampaign.findMany({
      where: { storeKey: "primary" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include,
    }),
    prisma.flashSaleCampaign.findFirst({
      where: {
        storeKey: "primary",
        status: "SCHEDULED",
        endsAt: { gt: new Date() },
      },
      orderBy: { startsAt: "asc" },
      include,
    }),
  ]);
  // An older active/next campaign must not disappear beneath newer drafts/history.
  const campaigns =
    relevant && !recent.some((c) => c.id === relevant.id)
      ? [relevant, ...recent]
      : recent;
  return campaigns.map((c) => ({
    ...c,
    items: c.items.map((item) => {
      const p = item.product;
      const regularPrice = Math.min(
        effectivePrice(p.basePrice, p.salePrice),
        ...p.variants.map((v) =>
          v.price != null
            ? effectivePrice(v.price, v.salePrice)
            : effectivePrice(p.basePrice, p.salePrice),
        ),
      );
      const eligibilityWarning =
        p.status !== "PUBLISHED"
          ? "Produk tidak terbit"
          : !p.variants.some(
                (v) => v.inventory && v.inventory.onHand > v.inventory.reserved,
              )
            ? "Stok tidak tersedia"
            : item.flashSalePrice >= regularPrice
              ? "Harga promo tidak lagi valid"
              : null;
      return {
        ...item,
        product: {
          name: p.name,
          basePrice: p.basePrice,
          salePrice: p.salePrice,
          status: p.status,
          regularPrice,
          eligibilityWarning,
        },
      };
    }),
  }));
}
export async function campaignProducts(actor: Actor, value: unknown = {}) {
  permit(actor);
  const parsed = campaignProductQuerySchema.safeParse(value);
  if (!parsed.success)
    throw new HttpError("Pencarian produk tidak valid.", 422);
  const query = parsed.data,
    page = query.page;
  const where: Prisma.ProductWhereInput = {
    ...(query.search
      ? { name: { contains: query.search.slice(0, 160), mode: "insensitive" } }
      : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * 20,
      take: 20,
      select: {
        id: true,
        name: true,
        basePrice: true,
        salePrice: true,
        status: true,
        isFlashSale: true,
        flashSalePrice: true,
        flashSaleStartsAt: true,
        flashSaleEndsAt: true,
        updatedAt: true,
        images: {
          take: 1,
          orderBy: { sortOrder: "asc" },
          select: { url: true },
        },
        variants: {
          select: {
            price: true,
            salePrice: true,
            inventory: { select: { onHand: true, reserved: true } },
          },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);
  return {
    page,
    total,
    items: items.map((p) => ({
      id: p.id,
      name: p.name,
      regularPrice: Math.min(
        p.isFlashSale ? p.basePrice : effectivePrice(p.basePrice, p.salePrice),
        ...p.variants.map((v) =>
          v.price != null
            ? effectivePrice(v.price, v.salePrice)
            : p.isFlashSale
              ? p.basePrice
              : effectivePrice(p.basePrice, p.salePrice),
        ),
      ),
      image: p.images[0]?.url ?? null,
      updatedAt: p.updatedAt.toISOString(),
      legacy:
        p.isFlashSale ||
        p.flashSalePrice != null ||
        p.flashSaleStartsAt != null ||
        p.flashSaleEndsAt != null,
      reason:
        p.status !== "PUBLISHED"
          ? "Produk belum terbit"
          : p.variants.some((v) => v.salePrice != null && v.price == null)
            ? "Harga varian tidak konsisten"
            : !p.variants.some(
                  (v) =>
                    v.inventory && v.inventory.onHand > v.inventory.reserved,
                )
              ? "Stok tidak tersedia"
              : null,
    })),
  };
}
export async function campaignHistory(actor: Actor) {
  permit(actor);
  const [campaigns, relevant] = await Promise.all([
    prisma.flashSaleCampaign.findMany({
      where: { storeKey: "primary" },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.flashSaleCampaign.findFirst({
      where: {
        storeKey: "primary",
        status: "SCHEDULED",
        endsAt: { gt: new Date() },
      },
      select: { id: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  return prisma.auditLog.findMany({
    where: {
      entity: "FlashSaleCampaign",
      entityId: {
        in: [...campaigns.map((c) => c.id), ...(relevant ? [relevant.id] : [])],
      },
    },
    select: { id: true, entityId: true, action: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
