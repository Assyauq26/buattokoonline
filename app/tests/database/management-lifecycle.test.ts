import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { deleteManagedProduct } from "@/modules/catalog/product-delete.service";
import { manageBankAccount } from "@/modules/payments/bank-management.service";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Prisma } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/management_v130_test") throw new Error("Requires isolated local management_v130_test database");
const run = randomUUID(); let staff: string, customer: string;
beforeAll(async () => {
  const role = await prisma.role.upsert({ where: { name: "Admin" }, update: {}, create: { name: "Admin", label: "Test operator" } });
  for (const key of [PERMISSIONS.PRODUCT_DELETE, PERMISSIONS.BANK_MANAGE]) {
    const permission = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, label: key } });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  }
  staff = (await prisma.user.create({ data: { name: "Test operator", email: `${run}-staff@example.test`, passwordHash: "disabled-test-login", roles: { create: { roleId: role.id } } } })).id;
  customer = (await prisma.user.create({ data: { name: "Test customer", email: `${run}-customer@example.test`, passwordHash: "disabled-test-login" } })).id;
});
afterAll(async () => prisma.$disconnect());
const product = () => prisma.product.create({ data: { name: "Test", slug: randomUUID(), basePrice: 10000, status: "DRAFT", variants: { create: { sku: randomUUID(), inventory: { create: { onHand: 1 } } } } }, include: { variants: true } });
const bankData = { bankName: "BCA", accountNumber: "0012345678", accountHolder: "Test Owner", displayName: "Test Bank" };
it("enforces persisted permission even when caller supplies another ID", async () => {
  const p = await product();
  await expect(deleteManagedProduct(customer, p.id, p.updatedAt.toISOString())).rejects.toMatchObject({ status: 403 });
  expect(await prisma.product.count({ where: { id: p.id } })).toBe(1);
});
it("serializes concurrent product deletion, records only one audit", async () => {
  const p = await product();
  const results = await Promise.all([1, 2].map(() => deleteManagedProduct(staff, p.id, p.updatedAt.toISOString())));
  expect(results.every(r => r.outcome === "deleted")).toBe(true);
  expect(await prisma.productVariant.count({ where: { productId: p.id } })).toBe(0);
  expect(await prisma.auditLog.count({ where: { entityId: p.id, action: "product.delete" } })).toBe(1);
});
it("archives ordered products and preserves order item values", async () => {
  const p = await product();
  const order = await prisma.order.create({ data: { userId: customer, orderNumber: randomUUID(), subtotal: 10000, total: 10000, items: { create: { variantId: p.variants[0].id, productName: "Original name", variantLabel: "Original variation", unitPrice: 10000, lineTotal: 10000, quantity: 1 } } }, include: { items: true } });
  expect((await deleteManagedProduct(staff, p.id, p.updatedAt.toISOString())).outcome).toBe("archived");
  expect(await prisma.orderItem.findMany({ where: { orderId: order.id } })).toEqual(order.items);
  expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("ARCHIVED");
});
it("versions edited bank account while preserving an existing payment", async () => {
  const bank = await prisma.bankAccount.create({ data: bankData });
  const order = await prisma.order.create({ data: { userId: customer, orderNumber: randomUUID(), subtotal: 10000, total: 10000, payment: { create: { amount: 10000, bankAccountId: bank.id } } } });
  const result = await manageBankAccount(staff, { kind: "edit", id: bank.id, revision: bank.updatedAt.toISOString(), value: { ...bankData, accountNumber: "987654321" } });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id }, include: { bankAccount: true } });
  expect(payment.bankAccount?.accountNumber).toBe(bankData.accountNumber);
  expect(payment.bankAccount?.isActive).toBe(false);
  expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: result.id } })).accountNumber).toBe("987654321");
});
it("concurrent bank edits create exactly one replacement and refuse stale second write", async () => {
  const bank = await prisma.bankAccount.create({ data: bankData });
  const command = { kind: "edit" as const, id: bank.id, revision: bank.updatedAt.toISOString(), value: bankData };
  const results = await Promise.allSettled([manageBankAccount(staff, command), manageBankAccount(staff, command)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(await prisma.auditLog.count({ where: { entityId: bank.id, action: "bank.edit" } })).toBe(1);
});
it("bank status changes wait for an in-flight checkout lock", async () => {
  const bank = await prisma.bankAccount.create({ data: bankData });
  let unlock!: () => void, acquired!: () => void;
  const locked = new Promise<void>(resolve => acquired = resolve);
  const release = new Promise<void>(resolve => unlock = resolve);
  const checkout = prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BankAccount" WHERE "id" = ${bank.id} FOR SHARE`);
    acquired(); await release;
    expect((await tx.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).isActive).toBe(true);
  });
  await locked;
  let completed = false;
  const deletion = manageBankAccount(staff, { kind: "delete", id: bank.id, revision: bank.updatedAt.toISOString() }).then(() => completed = true);
  await new Promise(resolve => setTimeout(resolve, 100)); expect(completed).toBe(false);
  unlock(); await checkout; await deletion;
  expect(await prisma.bankAccount.findFirst({ where: { id: bank.id, isActive: true, deletedAt: null } })).toBeNull();
});

it("queues owned legacy media after deletion without deleting external images", async () => {
  const p = await product(), imageId = randomUUID(), externalId = randomUUID();
  const objectPath = `store/product-images/${p.id}/${imageId}.webp`;
  await prisma.productImage.createMany({ data: [
    { id: imageId, productId: p.id, url: `/api/v1/product-images/${imageId}?object=${encodeURIComponent(objectPath)}`, sortOrder: 0 },
    { id: externalId, productId: p.id, url: "https://example.test/shared.jpg", sortOrder: 1 }
  ] });
  await deleteManagedProduct(staff, p.id, p.updatedAt.toISOString());
  expect((await prisma.stagedProductMedia.findUniqueOrThrow({ where: { id: imageId } })).objectPath).toBe(objectPath);
  expect(await prisma.stagedProductMedia.findUnique({ where: { id: externalId } })).toBeNull();
});
