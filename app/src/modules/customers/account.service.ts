import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertStaffPermission } from "@/modules/orders/transaction-locks";
import { enforceAuthRateLimit } from "@/lib/auth/rate-limit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { normalizeRegistrationPhone } from "@/modules/auth/registration-otp";
import { recoveryIdentityQuery } from "@/modules/auth/registration-identity";
import { registrationSchema } from "@/modules/auth/registration-schema";
import { requestPasswordReset } from "@/modules/auth/auth.service";
import { sendStoreMail } from "@/modules/auth/registration-otp-email";
import { refundReturnSchema } from "@/modules/payments/refund.validation";
import { activeRefund } from "@/modules/payments/refund-state";
import { writeAudit } from "@/modules/audit/audit.service";
import { addressSchema } from "@/modules/regions/region.validation";
import { validateLocation } from "@/modules/regions/region.service";
import { validateJntLocation } from "@/infrastructure/shipping/jnt/mapping-regions";
import { readActiveJntRelease } from "@/infrastructure/shipping/jnt/verified-mapping";

export const customerOnly = { roles: { none: { role: { name: { not: "Customer" } } } } } satisfies Prisma.UserWhereInput;
const profileSchema = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().min(8).max(40) }).strict();
type Tx = Prisma.TransactionClient;
async function lockCustomer(tx: Tx, id: string, allowInactive = false) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`);
  const user = await tx.user.findFirst({ where: { id, ...customerOnly, deletedAt: null, ...(allowInactive ? {} : { isActive: true }) } });
  if (!user) throw new HttpError("Akun pelanggan tidak tersedia", 404);
  return user;
}
function revisionCheck(actual: Date, expected: string) {
  if (actual.toISOString() !== expected) throw new HttpError("Data telah berubah. Muat ulang sebelum menyimpan.", 409);
}
export async function updateCustomerProfile(id: string, revision: string, value: unknown, operator?: string) {
  const parsed = profileSchema.safeParse(value);
  if (!parsed.success) throw new HttpError("Nama dan nomor telepon tidak valid", 422);
  const phone = normalizeRegistrationPhone(parsed.data.phone);
  try {
    return await prisma.$transaction(async tx => {
      if (operator) await assertStaffPermission(tx, operator, PERMISSIONS.CUSTOMER_UPDATE);
      const user = await lockCustomer(tx, id, !!operator); revisionCheck(user.updatedAt, revision);
      // Match legacy phone formatting too. Serializable transaction and unique index protect concurrent edits.
      const identities = await tx.$queryRaw<{ filtered: boolean; ids: string[] }[]>(recoveryIdentityQuery(null, phone, phone));
      if (!identities[0] || identities[0].filtered) throw new HttpError("Pemeriksaan identitas belum tersedia.", 503);
      if (identities[0].ids.some(other => other !== id)) throw new HttpError("Nomor telepon sudah digunakan.", 409);
      await tx.user.update({ where: { id }, data: { name: parsed.data.name, phone } });
      await tx.customer.upsert({ where: { userId: id }, create: { userId: id, fullName: parsed.data.name, phone }, update: { fullName: parsed.data.name, phone } });
      await writeAudit({ userId: operator || id, action: "customer.profile.update", entity: "User", entityId: id }, tx);
      return { message: "Profil berhasil diperbarui." };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new HttpError("Nomor telepon digunakan atau data berubah. Muat ulang dan coba kembali.", 409);
    throw error;
  }
}
export async function setCustomerActive(operator: string, id: string, revision: string, active: boolean) {
  if (typeof active !== "boolean") throw new HttpError("Status tidak valid", 422);
  return prisma.$transaction(async tx => {
    await assertStaffPermission(tx, operator, PERMISSIONS.CUSTOMER_UPDATE);
    const user = await lockCustomer(tx, id, true);
    if (user.isActive === active) return { message: "Status akun sudah sesuai." };
    revisionCheck(user.updatedAt, revision);
    await tx.user.update({ where: { id }, data: { isActive: active, sessionVersion: { increment: 1 } } });
    await tx.passwordResetToken.deleteMany({ where: { userId: id } });
    await writeAudit({ userId: operator, action: active ? "customer.activate" : "customer.deactivate", entity: "User", entityId: id }, tx);
    return { message: active ? "Akun diaktifkan. Pelanggan perlu login kembali." : "Akun dinonaktifkan dan seluruh sesi dicabut." };
  });
}
export async function sendCustomerRecovery(operator: string, id: string) {
  await assertStaffPermission(prisma, operator, PERMISSIONS.CUSTOMER_UPDATE);
  const user = await prisma.user.findFirst({ where: { id, ...customerOnly, isActive: true, deletedAt: null } });
  if (!user) throw new HttpError("Akun pelanggan aktif tidak ditemukan", 404);
  await requestPasswordReset(user.email);
  await writeAudit({ userId: operator, action: "customer.recovery.requested", entity: "User", entityId: id });
  return { message: "Permintaan pemulihan dikirim ke email terdaftar pelanggan." };
}
export async function changeCustomerPassword(id: string, value: unknown) {
  const input = z.object({ currentPassword: z.string().min(1).max(256), password: registrationSchema.shape.password, confirmPassword: z.string().max(256) }).strict().refine(v => v.password === v.confirmPassword).safeParse(value);
  if (!input.success) throw new HttpError("Password baru minimal 6 karakter, maksimal 72 byte, dan konfirmasi harus sama.", 422);
  await enforceAuthRateLimit("accountSecurity", id);
  const hash = await hashPassword(input.data.password);
  const email = await prisma.$transaction(async tx => {
    const user = await lockCustomer(tx, id);
    if (!await verifyPassword(input.data.currentPassword, user.passwordHash)) throw new HttpError("Password saat ini tidak sesuai", 422);
    await tx.user.update({ where: { id }, data: { passwordHash: hash, sessionVersion: { increment: 1 } } });
    await tx.passwordResetToken.deleteMany({ where: { userId: id } });
    await writeAudit({ userId: id, action: "customer.password.changed", entity: "User", entityId: id }, tx);
    return user.email;
  });
  let notified = false;
  try { await sendStoreMail("customer-changed", email, ""); notified = true; } catch { /* Password stays changed; report delivery failure truthfully. */ }
  await writeAudit({ userId: id, action: notified ? "customer.password.notice.sent" : "customer.password.notice.failed", entity: "User", entityId: id });
  return { signOut: true, message: `Password berubah dan seluruh sesi dicabut. ${notified ? "Notifikasi email dikirim." : "Notifikasi email belum dapat dikirim."} Silakan login kembali.` };
}
export async function deleteCustomerAccount(id: string, input: { confirmed: boolean; password?: string }, operator?: string) {
  if (input.confirmed !== true) throw new HttpError("Konfirmasi penghapusan wajib diisi", 422);
  if (!operator) await enforceAuthRateLimit("accountSecurity", id);
  const disabledHash = await hashPassword(randomUUID() + randomUUID());
  return prisma.$transaction(async tx => {
    if (operator) await assertStaffPermission(tx, operator, PERMISSIONS.CUSTOMER_DELETE);
    const user = await lockCustomer(tx, id, !!operator);
    if (!operator && (!input.password || input.password.length > 256 || !await verifyPassword(input.password, user.passwordHash))) throw new HttpError("Password saat ini tidak sesuai", 422);
    // Checkout takes the User lock first as well, so a new order cannot race this decision.
    const orders = await tx.order.findMany({ where: { userId: id }, include: { payment: true, shipment: true, items: true } });
    for (const order of orders) {
      if (!["COMPLETED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(order.status) ||
          (order.status !== "COMPLETED" && order.payment && !["EXPIRED", "REFUNDED", "REJECTED"].includes(order.payment.status)) ||
          (order.payment && await activeRefund(tx, order.payment.id)))
        throw new HttpError("Selesaikan pesanan dan proses pembayaran/refund sebelum menghapus akun.", 409);
      if (order.status === "REFUNDED" && order.shipment && !order.shipment.cancelledAt && order.shipment.status !== "PENDING") {
        const receipts = await tx.paymentEvent.findMany({ where: { paymentId: order.payment?.id || "missing", type: "REFUND_RETURN_RECEIVED" } });
        const returned = receipts.flatMap(event => { const parsed = refundReturnSchema.safeParse(event.payload); return parsed.success ? parsed.data.items : []; });
        if (order.items.some(item => returned.filter(row => row.orderItemId === item.id).reduce((sum, row) => sum + row.quantity, 0) < item.quantity))
          throw new HttpError("Selesaikan penerimaan retur sebelum menghapus akun.", 409);
      }
    }
    await tx.user.update({ where: { id }, data: { name: "Pelanggan dihapus", email: `${randomUUID()}@deleted.invalid`, phone: null, passwordHash: disabledHash, isActive: false, deletedAt: new Date(), emailVerifiedAt: null, sessionVersion: { increment: 1 } } });
    const customer = await tx.customer.findUnique({ where: { userId: id } });
    if (customer) {
      await tx.customerAddress.deleteMany({ where: { customerId: customer.id } });
      await tx.customer.update({ where: { id: customer.id }, data: { fullName: "Pelanggan dihapus", phone: null } });
    }
    await tx.passwordResetToken.deleteMany({ where: { userId: id } });
    await tx.cart.deleteMany({ where: { userId: id } });
    await tx.wishlist.deleteMany({ where: { userId: id } });
    await tx.recentlyViewed.deleteMany({ where: { userId: id } });
    await tx.notification.deleteMany({ where: { userId: id } });
    await tx.checkoutIntent.deleteMany({ where: { userId: id, consumedAt: null } });
    await writeAudit({ userId: operator || id, action: "customer.anonymized", entity: "User", entityId: id }, tx);
    return { signOut: !operator, message: "Akun dihapus. Riwayat transaksi yang diperlukan tetap disimpan." };
  }, { timeout: 15000 });
}

export async function saveCustomerAddress(userId: string, id: string | null, value: unknown, makeDefault: boolean) {
  const parsed = addressSchema.safeParse(value);
  if (!parsed.success || typeof makeDefault !== "boolean") throw new HttpError("Lengkapi penerima dan alamat pengiriman", 422);
  const location = parsed.data.districtCode.startsWith("JNT-")
    ? await validateJntLocation(parsed.data, (await readActiveJntRelease()).version) : await validateLocation(parsed.data);
  return prisma.$transaction(async tx => {
    const user = await lockCustomer(tx, userId);
    const customer = await tx.customer.upsert({ where: { userId }, create: { userId, fullName: user.name, phone: user.phone }, update: {} });
    if (id && !await tx.customerAddress.findFirst({ where: { id, customerId: customer.id } })) throw new HttpError("Alamat tidak ditemukan", 404);
    const count = await tx.customerAddress.count({ where: { customerId: customer.id } });
    if (!id && count >= 20) throw new HttpError("Maksimal 20 alamat tersimpan", 422);
    const current = id ? await tx.customerAddress.findUnique({ where: { id } }) : null;
    const isDefault = makeDefault || count === 0 || !!current?.isDefault;
    if (isDefault) await tx.customerAddress.updateMany({ where: { customerId: customer.id }, data: { isDefault: false } });
    const data = { ...location, recipientName: parsed.data.recipientName, phone: parsed.data.phone, line: parsed.data.line, isDefault };
    if (id) await tx.customerAddress.update({ where: { id }, data });
    else await tx.customerAddress.create({ data: { ...data, customerId: customer.id } });
    await writeAudit({ userId, action: id ? "customer.address.update" : "customer.address.create", entity: "Customer", entityId: customer.id }, tx);
    return { message: "Alamat tersimpan." };
  });
}
export async function changeCustomerAddress(userId: string, id: string, operation: "delete" | "default") {
  return prisma.$transaction(async tx => {
    await lockCustomer(tx, userId);
    const address = await tx.customerAddress.findFirst({ where: { id, customer: { userId } } });
    if (!address) throw new HttpError("Alamat tidak ditemukan", 404);
    if (operation === "default") {
      await tx.customerAddress.updateMany({ where: { customerId: address.customerId }, data: { isDefault: false } });
      await tx.customerAddress.update({ where: { id }, data: { isDefault: true } });
    } else if (operation === "delete") {
      await tx.customerAddress.delete({ where: { id } });
      if (address.isDefault) {
        const next = await tx.customerAddress.findFirst({ where: { customerId: address.customerId }, orderBy: { id: "asc" } });
        if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    } else throw new HttpError("Aksi tidak valid", 422);
    await writeAudit({ userId, action: `customer.address.${operation}`, entity: "CustomerAddress", entityId: id }, tx);
    return { message: operation === "delete" ? "Alamat dihapus." : "Alamat utama diperbarui." };
  });
}
