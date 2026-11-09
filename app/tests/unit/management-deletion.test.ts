import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ $transaction: vi.fn(), $queryRaw: vi.fn(), user: { findUnique: vi.fn() }, product: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() }, productVariantOptionValue: { deleteMany: vi.fn() }, productOptionValue: { deleteMany: vi.fn() }, stagedProductMedia: { updateMany: vi.fn() }, auditLog: { create: vi.fn() }, bankAccount: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { deleteManagedProduct } from "@/modules/catalog/product-delete.service";
import { bankInputSchema, manageBankAccount } from "@/modules/payments/bank-management.service";
const now = new Date("2026-11-09T00:00:00Z");
beforeEach(() => {
  vi.resetAllMocks(); db.$transaction.mockImplementation(fn => fn(db));
  db.user.findUnique.mockResolvedValue({ isActive: true, roles: [{ role: { name: "Admin", permissions: ["product.delete", "bank.manage"].map(key => ({ permission: { key } })) } }] });
  db.product.findUnique.mockResolvedValue({ id: "p", status: "DRAFT", updatedAt: now, images: [], variants: [], _count: { reviews: 0, questions: 0, flashCampaignItems: 0 } });
});
it("refuses stale or removed operator permissions", async () => {
  db.user.findUnique.mockResolvedValue({ isActive: false, roles: [] });
  await expect(deleteManagedProduct("staff", "p", now.toISOString())).rejects.toMatchObject({ status: 403 });
  await expect(manageBankAccount("staff", { kind: "delete", id: "b", revision: now.toISOString() })).rejects.toMatchObject({ status: 403 });
  expect(db.product.delete).not.toHaveBeenCalled(); expect(db.bankAccount.update).not.toHaveBeenCalled();
});
it("archives a product with order references and preserves variants", async () => {
  const p = await db.product.findUnique(); p.variants = [{ _count: { orderItems: 1, movements: 0 } }];
  expect((await deleteManagedProduct("staff", "p", now.toISOString())).outcome).toBe("archived");
  expect(db.product.delete).not.toHaveBeenCalled(); expect(db.productVariantOptionValue.deleteMany).not.toHaveBeenCalled();
});
it("rejects stale product delete; repeats are idempotent after deletion", async () => {
  await expect(deleteManagedProduct("staff", "p", "old")).rejects.toMatchObject({ status: 409 });
  db.product.findUnique.mockResolvedValue(null);
  expect((await deleteManagedProduct("staff", "p", "old")).outcome).toBe("deleted");
  expect(db.auditLog.create).not.toHaveBeenCalled();
});
it("deletes only an unreferenced product and writes an audit in the transaction", async () => {
  expect((await deleteManagedProduct("staff", "p", now.toISOString())).outcome).toBe("deleted");
  expect(db.product.delete).toHaveBeenCalledWith({ where: { id: "p" } });
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "product.delete" }) }));
});
const input = { bankName: "BCA", accountNumber: "00123456", accountHolder: "Nama Pemilik", displayName: "BCA Toko" };
it.each(["123 456", "12", "123a456", "1".repeat(35)])("rejects malformed bank number %s", accountNumber => {
  expect(bankInputSchema.safeParse({ ...input, accountNumber }).success).toBe(false);
});
it("preserves leading zeroes and rejects control characters/unknown input", () => {
  expect(bankInputSchema.parse(input).accountNumber).toBe("00123456");
  expect(bankInputSchema.safeParse({ ...input, accountHolder: "Name\nInjected" }).success).toBe(false);
  expect(bankInputSchema.safeParse({ ...input, isActive: true }).success).toBe(false);
});
it("versions bank edits without changing old payment details", async () => {
  db.bankAccount.findUnique.mockResolvedValue({ id: "old", updatedAt: now, isActive: true, deletedAt: null, ...input });
  db.bankAccount.create.mockResolvedValue({ id: "new" });
  expect((await manageBankAccount("staff", { kind: "edit", id: "old", revision: now.toISOString(), value: { ...input, accountNumber: "999" } })).id).toBe("new");
  expect(db.bankAccount.update).toHaveBeenCalledWith({ where: { id: "old" }, data: { isActive: false, deletedAt: expect.any(Date), updatedAt: expect.any(Date) } });
  expect(db.bankAccount.create).toHaveBeenCalledWith({ data: { ...input, accountNumber: "999", isActive: true } });
});
it("cannot reactivate a deleted account", async () => {
  db.bankAccount.findUnique.mockResolvedValue({ id: "b", deletedAt: now });
  await expect(manageBankAccount("staff", { kind: "status", id: "b", revision: now.toISOString(), active: true })).rejects.toMatchObject({ status: 409 });
  expect(db.bankAccount.update).not.toHaveBeenCalled();
});
