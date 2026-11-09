import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mail = vi.hoisted(() => ({ send: vi.fn(async () => undefined) }));
vi.mock("@/modules/auth/registration-otp-email", () => ({ sendStoreMail: mail.send }));
vi.mock("@/modules/auth/auth.service", () => ({ requestPasswordReset: vi.fn() }));
vi.mock("@/infrastructure/shipping/jnt/verified-mapping", () => ({ readActiveJntRelease: async () => ({ version: "synthetic" }) }));
vi.mock("@/infrastructure/shipping/jnt/mapping-regions", () => ({ validateJntLocation: async (value: object) => ({ ...value, province: "Test Province", city: "Test City", district: "Test District", regionSource: "jnt-mapping", regionUpdatedAt: "2026-11-09" }) }));
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { updateCustomerProfile, setCustomerActive, deleteCustomerAccount, changeCustomerPassword, saveCustomerAddress, changeCustomerAddress } from "@/modules/customers/account.service";
import { PERMISSIONS } from "@/lib/auth/permissions";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/management_v130_test") throw new Error("Requires isolated local management_v130_test database");
let staff: string, hash: string;
beforeAll(async () => {
  process.env.STORE_ISOLATED_TESTS = "1";
  hash = await hashPassword("Synthetic-old-123");
  const role = await prisma.role.upsert({ where: { name: "Admin" }, update: {}, create: { name: "Admin", label: "Test" } });
  for (const key of [PERMISSIONS.CUSTOMER_UPDATE, PERMISSIONS.CUSTOMER_DELETE]) {
    const permission = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, label: key } });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  }
  staff = (await prisma.user.create({ data: { name: "Test operator", email: `${randomUUID()}@example.test`, passwordHash: hash, roles: { create: { roleId: role.id } } } })).id;
});
afterAll(async () => prisma.$disconnect());
const user = () => prisma.user.create({ data: { name: "Test Customer", email: `${randomUUID()}@example.test`, passwordHash: hash } });
const address = { provinceCode: "Test Province", cityCode: "Test City", districtCode: "JNT-BGG001", villageCode: "", postalCode: "", village: "Desa Contoh", recipientName: "Test Customer", phone: "081234567890", line: "Jalan Contoh 1" };
it("refuses customer mutations against staff accounts", async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { id: staff } });
  await expect(setCustomerActive(staff, staff, admin.updatedAt.toISOString(), false)).rejects.toMatchObject({ status: 404 });
  await expect(deleteCustomerAccount(staff, { confirmed: true }, staff)).rejects.toMatchObject({ status: 404 });
});
it("does not accept profile email/password injection or forged seller authorization", async () => {
  const u = await user();
  await expect(updateCustomerProfile(u.id, u.updatedAt.toISOString(), { name: "Test", phone: "081234567890", email: "takeover@example.test" })).rejects.toMatchObject({ status: 422 });
  await expect(setCustomerActive(u.id, u.id, u.updatedAt.toISOString(), false)).rejects.toMatchObject({ status: 403 });
});
it("rejects wrong password and revokes all old sessions/reset links on successful change", async () => {
  const u = await user(); await prisma.passwordResetToken.create({ data: { userId: u.id, token: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
  await expect(changeCustomerPassword(u.id, { currentPassword: "Wrong", password: "Synthetic-new-456", confirmPassword: "Synthetic-new-456" })).rejects.toMatchObject({ status: 422 });
  expect(await changeCustomerPassword(u.id, { currentPassword: "Synthetic-old-123", password: "Synthetic-new-456", confirmPassword: "Synthetic-new-456" })).toMatchObject({ signOut: true });
  const changed = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  expect(changed.sessionVersion).toBe(1); expect(await verifyPassword("Synthetic-old-123", changed.passwordHash)).toBe(false); expect(await verifyPassword("Synthetic-new-456", changed.passwordHash)).toBe(true);
  expect(await prisma.passwordResetToken.count({ where: { userId: u.id } })).toBe(0); expect(mail.send).toHaveBeenCalledWith("customer-changed", u.email, "");
});
it("limits password guessing using a persistent account bucket", async () => {
  const u = await user();
  for (let i = 0; i < 5; i++) await expect(changeCustomerPassword(u.id, { currentPassword: "Wrong", password: "Synthetic-new-456", confirmPassword: "Synthetic-new-456" })).rejects.toMatchObject({ status: 422 });
  await expect(changeCustomerPassword(u.id, { currentPassword: "Wrong", password: "Synthetic-new-456", confirmPassword: "Synthetic-new-456" })).rejects.toMatchObject({ status: 429 });
});
it("disables and re-enables customer without restoring old sessions", async () => {
  const u = await user(); await setCustomerActive(staff, u.id, u.updatedAt.toISOString(), false);
  const disabled = await prisma.user.findUniqueOrThrow({ where: { id: u.id } }); expect(disabled.sessionVersion).toBe(1);
  await setCustomerActive(staff, u.id, disabled.updatedAt.toISOString(), true);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).sessionVersion).toBe(2);
});
it("checks address ownership and serializes default selection", async () => {
  const u = await user(), other = await user();
  await Promise.all([saveCustomerAddress(u.id, null, address, true), saveCustomerAddress(u.id, null, { ...address, line: "Jalan Kedua 2" }, true)]);
  const saved = await prisma.customerAddress.findMany({ where: { customer: { userId: u.id } } }); expect(saved).toHaveLength(2); expect(saved.filter(a => a.isDefault)).toHaveLength(1);
  await expect(changeCustomerAddress(other.id, saved[0].id, "delete")).rejects.toMatchObject({ status: 404 });
  await expect(saveCustomerAddress(other.id, saved[0].id, address, true)).rejects.toMatchObject({ status: 404 });
  await changeCustomerAddress(u.id, saved.find(a => a.isDefault)!.id, "delete");
  expect(await prisma.customerAddress.count({ where: { customer: { userId: u.id }, isDefault: true } })).toBe(1);
});
it("blocks deletion with active orders and requires own password", async () => {
  const u = await user();
  await expect(deleteCustomerAccount(u.id, { confirmed: true, password: "Wrong" })).rejects.toMatchObject({ status: 422 });
  await prisma.order.create({ data: { userId: u.id, orderNumber: randomUUID(), subtotal: 10000, total: 10000, status: "PACKED", paymentStatus: "PAID", payment: { create: { amount: 10000, status: "PAID" } } } });
  await expect(deleteCustomerAccount(u.id, { confirmed: true, password: "Synthetic-old-123" })).rejects.toMatchObject({ status: 409 });
  expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).isActive).toBe(true);
});
it("anonymizes only after completion and preserves financial/address history", async () => {
  const u = await user(); await saveCustomerAddress(u.id, null, address, true);
  const order = await prisma.order.create({ data: { userId: u.id, orderNumber: randomUUID(), subtotal: 10000, total: 10000, status: "COMPLETED", paymentStatus: "PAID", payment: { create: { amount: 10000, status: "PAID" } }, address: { create: { recipientName: "Original recipient", phone: "081234567890", line: "Original street", city: "Original city", province: "Original province", postalCode: "" } } }, include: { address: true, payment: true } });
  await deleteCustomerAccount(u.id, { confirmed: true, password: "Synthetic-old-123" });
  const deleted = await prisma.user.findUniqueOrThrow({ where: { id: u.id } }); expect(deleted.isActive).toBe(false); expect(deleted.deletedAt).not.toBeNull(); expect(deleted.email).toMatch(/@deleted.invalid$/); expect(deleted.sessionVersion).toBe(1);
  const retained = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { address: true, payment: true } }); expect(retained.address).toEqual(order.address); expect(retained.payment).toEqual(order.payment);
  expect(await prisma.customerAddress.count({ where: { customer: { userId: u.id } } })).toBe(0);
  await expect(setCustomerActive(staff, u.id, deleted.updatedAt.toISOString(), true)).rejects.toMatchObject({ status: 404 });
});

it("allows deletion after a settled refund before handover", async () => {
  const u = await user();
  const order = await prisma.order.create({ data: { userId: u.id, orderNumber: randomUUID(), subtotal: 10000, total: 10000, status: "REFUNDED", paymentStatus: "REFUNDED", payment: { create: { amount: 10000, status: "REFUNDED" } } } });
  await deleteCustomerAccount(u.id, { confirmed: true, password: "Synthetic-old-123" });
  expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).deletedAt).not.toBeNull();
  expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUNDED");
});
