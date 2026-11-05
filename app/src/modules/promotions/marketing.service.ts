import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { writeAudit } from "@/modules/audit/audit.service";
import { couponReservationWhere, NON_CONSUMING_COUPON_ORDER_STATUSES } from "./coupon.service";
import { voucherInputSchema } from "./marketing.validation";

type Actor = { id: string; isAdmin: boolean; permissions: string[] };
function permit(actor: Actor, permission: string) {
  if (!actor.isAdmin || !actor.permissions.includes(permission))
    throw new HttpError("Anda tidak memiliki izin mengelola promosi", 403);
}
export function voucherStatus(v: { isActive: boolean; startsAt?: Date | null; expiresAt: Date | null }, now = new Date()) {
  return !v.isActive ? "NONAKTIF" : v.expiresAt && v.expiresAt <= now ? "KEDALUWARSA" : v.startsAt && v.startsAt > now ? "TERJADWAL" : "AKTIF";
}

/** Reads marketing campaigns with usage totals; requires Sprint 2K Coupon migration. */
export async function listMarketing(actor: Actor) {
  if (!actor.isAdmin || ![PERMISSIONS.PROMOTION_CREATE, PERMISSIONS.PROMOTION_UPDATE].some(p => actor.permissions.includes(p)))
    throw new HttpError("Anda tidak memiliki izin melihat Marketing", 403);
  const now = new Date();
  const [vouchers, activeVouchers] = await Promise.all([
    prisma.coupon.findMany({ orderBy:[{createdAt:"desc"},{id:"desc"}],take:100 }),
    prisma.coupon.count({where:{isActive:true,AND:[{OR:[{startsAt:null},{startsAt:{lte:now}}]},{OR:[{expiresAt:null},{expiresAt:{gt:now}}]}]}}),
  ]);
  const codes = vouchers.map(v => v.code);
  const usage = codes.length ? await prisma.order.groupBy({
    by: ["couponCode"], where: { couponCode: { in: codes }, status: { notIn: NON_CONSUMING_COUPON_ORDER_STATUSES } }, _count: { _all: true },
  }) : [];
  const usedMap = new Map(usage.map(row => [row.couponCode, row._count._all]));
  return { vouchers: vouchers.map(row => ({ ...row, usedCount: usedMap.get(row.code) ?? 0 })), activeVouchers };
}

export async function saveVoucher(actor: Actor, id: string | null, value: unknown) {
  permit(actor, id ? PERMISSIONS.PROMOTION_UPDATE : PERMISSIONS.PROMOTION_CREATE);
  const parsed = voucherInputSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(parsed.error.issues[0].message, 422);
  const input = parsed.data;
  const payload = {
    code: input.code,
    discountType: input.discountType,
    discountValue: input.discountValue,
    minSpend: input.minSpend,
    maxDiscount: input.maxDiscount,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    usageLimit: input.usageLimit,
    perUserLimit: input.perUserLimit,
    isActive: input.isActive,
  };
  try {
    return await prisma.$transaction(async tx => {
      if (id) {
        // Locks serialize edits with checkout's exclusive Coupon row lock.
        const rows = await tx.$queryRaw<Array<{ id: string; code: string }>>(Prisma.sql`SELECT "id", "code" FROM "Coupon" WHERE "id" = ${id} FOR UPDATE`);
        if (!rows.length) throw new HttpError("Voucher tidak ditemukan", 404);
        if (rows[0].code !== input.code) throw new HttpError("Kode voucher tidak boleh diubah. Buat voucher baru.", 422);
        if (input.usageLimit != null) {
          const used = await tx.order.count({ where: couponReservationWhere(input.code) });
          if (input.usageLimit < used) throw new HttpError("Kuota total tidak boleh lebih kecil dari jumlah pemakaian yang sudah terjadi.", 422);
        }
      }
      const row = id
        ? await tx.coupon.update({ where: { id }, data: payload })
        : await tx.coupon.create({ data: payload });
      await writeAudit({ userId: actor.id, entity: "Coupon", entityId: row.id, action: id ? "coupon.update" : "coupon.create", meta: { code: row.code, isActive: row.isActive, discountType: row.discountType, discountValue: row.discountValue } }, tx);
      return { id: row.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new HttpError("Kode voucher sudah digunakan", 409);
    throw error;
  }
}

export async function setVoucherActive(actor: Actor, id: string, isActive: boolean) {
  permit(actor, PERMISSIONS.PROMOTION_UPDATE);
  if (!id || id.length > 64) throw new HttpError("ID voucher tidak valid", 422);
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Coupon" WHERE "id" = ${id} FOR UPDATE`);
    if (!rows.length) throw new HttpError("Voucher tidak ditemukan", 404);
    const row = await tx.coupon.findUniqueOrThrow({ where: { id } });
    if (isActive && row.expiresAt && row.expiresAt <= new Date())
      throw new HttpError("Voucher sudah kedaluwarsa. Ubah tanggal berakhir terlebih dahulu.", 409);
    if (row.isActive === isActive) return { id };
    await tx.coupon.update({ where: { id }, data: { isActive } });
    await writeAudit({ userId: actor.id, entity: "Coupon", entityId: id, action: isActive ? "coupon.activate" : "coupon.deactivate" }, tx);
    return { id };
  });
}

/** Compatibility endpoints fail closed; campaigns are the sole writer. */
export async function setFlashSale(actor: Actor, _value: unknown) {
  permit(actor, PERMISSIONS.PROMOTION_UPDATE);
  throw new HttpError("Flash Sale per produk sudah dihentikan. Gunakan Marketing → Flash Sale Campaign.",410);
}
export async function setScheduledFlashSale(actor: Actor, _value: unknown) {
  permit(actor, PERMISSIONS.PROMOTION_UPDATE);
  throw new HttpError("Jadwal per produk sudah dihentikan. Gunakan Marketing → Flash Sale Campaign.",410);
}
