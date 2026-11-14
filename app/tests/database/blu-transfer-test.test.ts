import { createHash, randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prisma } from "@/lib/prisma";
import { createBluTestOrder, listBluTestOrders } from "@/modules/payments/evidence/test-orders";
import { approvePayment, submitConfirmation } from "@/modules/payments/payments.service";
const target = new URL(process.env.DATABASE_URL || "http://invalid");
if (target.hostname !== "127.0.0.1" || !["5568", "5432"].includes(target.port) || target.pathname !== "/hubify_payment_evidence_test")
  throw new Error("Isolated local evidence database required");
const scope = `blu-issuance-${randomUUID()}`;
let actor: string, other: string, sourceId: string, accountRef: string;
const requestId = randomUUID();
beforeAll(async () => {
  vi.stubEnv("PAYMENT_EVIDENCE_PREVIEW", "true"); vi.stubEnv("STORE_INSTALLATION_ID", scope);
  vi.stubEnv("PAYMENT_GMAIL_OAUTH_TEST", "true");
  const role = await prisma.role.upsert({ where: { name: "Admin" }, create: { name: "Admin", label: "Test admin" }, update: {} });
  for (const key of ["bank.manage", "payment.read", "payment.verify"]) {
    const p = await prisma.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
      create: { roleId: role.id, permissionId: p.id }, update: {} });
  }
  const makeUser = () => prisma.user.create({ data: { name: "Synthetic blu tester", email: `${randomUUID()}@example.test`, passwordHash: "disabled",
    roles: { create: { roleId: role.id } } } });
  actor = (await makeUser()).id; other = (await makeUser()).id;
  vi.stubEnv("PAYMENT_EVIDENCE_ADMIN_IDS", `${actor},${other}`);
  const accountNumber = randomUUID().replace(/\D/g, "").padEnd(12, "0").slice(0, 12);
  const bank = await prisma.bankAccount.create({ data: { bankName: "Synthetic blu", displayName: "Fixture", accountHolder: "Fixture", accountNumber } });
  accountRef = createHash("sha256").update(JSON.stringify(["IDR", accountNumber])).digest("hex");
  sourceId = (await prisma.paymentEvidenceSource.create({ data: { storeScope: scope, kind: "GMAIL_BANK", label: "Synthetic only",
    bankAccountId: bank.id, accountRef, encryptedSecret: "unused-synthetic-value", health: "REVIEW_ONLY" } })).id;
});
afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect(); });
const input = () => ({ sourceId, requestId, baseAmount: 10000, windowMinutes: 10 });
it("rejects a base below the bank minimum before creating any order", async () => {
  const before = await prisma.order.count();
  await expect(createBluTestOrder(actor, { ...input(), baseAmount: 9999 })).rejects.toMatchObject({ name: "ZodError" });
  expect(await prisma.order.count()).toBe(before);
});
it("issues atomically and retries without creating duplicate orders, stock or shipment", async () => {
  const before = { inventory: await prisma.inventory.count(), shipments: await prisma.shipment.count(), items: await prisma.orderItem.count() };
  const result = await createBluTestOrder(actor, input());
  const retry = await createBluTestOrder(actor, input());
  expect(retry).toEqual({ id: result.id, replayed: true });
  const a = await prisma.paymentEvidenceAttempt.findUniqueOrThrow({ where: { id: result.id }, include: { payment: { include: { order: true } } } });
  expect(a.payable).toBe(10001); expect(a.uniqueCode).toBe(1);
  expect(+a.expiresAt - +a.createdAt).toBe(600000);
  expect(a.payment.amount).toBe(a.payable); expect(a.payment.order.total).toBe(a.payable);
  expect(a.payment.status).toBe("PENDING_PAYMENT"); expect(a.payment.order.orderNumber).toMatch(/^BLU-TEST-/);
  expect({ inventory: await prisma.inventory.count(), shipments: await prisma.shipment.count(), items: await prisma.orderItem.count() }).toEqual(before);
  await expect(approvePayment(a.payment.id, actor)).rejects.toThrow("Pesanan uji blu");
  await expect(submitConfirmation(actor, a.payment.orderId, { senderBank: "Fixture", senderName: "Fixture", amount: a.payable,
    transferDate: new Date(), proofPath: "fixture", proofMime: "image/png" })).rejects.toThrow("Pesanan uji blu");
  await expect(createBluTestOrder(actor, { ...input(), baseAmount: 20000 })).rejects.toThrow("data berbeda");
});
it("serializes concurrent issuances per account and rejects a second active test", async () => {
  const results = await Promise.allSettled([createBluTestOrder(other, { ...input(), requestId: randomUUID() }), createBluTestOrder(other, { ...input(), requestId: randomUUID() })]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const rows = await listBluTestOrders(other); expect(rows).toHaveLength(1); expect(rows[0].payable).toBe(10002);
  expect((await listBluTestOrders(actor)).some(t => t.id === rows[0].id)).toBe(false);
});
it("only matches a newly issued exact amount in its transaction time window", async () => {
  const a = (await listBluTestOrders(actor))[0];
  const base = { sourceId, accountRef, amount: a.payable, currency: "IDR", direction: "CREDIT", providerStatus: "UNKNOWN",
    fingerprint: "synthetic", reason: "MISSING_STABLE_TRANSACTION_ID", occurredAt: new Date(+new Date(a.createdAt) + 1000) };
  await prisma.incomingPaymentEvidence.create({ data: { ...base, externalId: randomUUID(), occurredAt: new Date(+new Date(a.createdAt) - 1) } });
  expect((await listBluTestOrders(actor))[0].matches).toHaveLength(0);
  await prisma.incomingPaymentEvidence.create({ data: { ...base, externalId: randomUUID() } });
  expect((await listBluTestOrders(actor))[0].matches).toHaveLength(1);
  await prisma.incomingPaymentEvidence.create({ data: { ...base, externalId: randomUUID() } });
  expect((await listBluTestOrders(actor))[0].matches).toHaveLength(2);
  expect(await prisma.paymentEvidenceClaim.count({ where: { evidence: { sourceId } } })).toBe(0);
});
it("denies unenrolled and disabled-preview actors without issuing any order", async () => {
  const count = await prisma.order.count(); vi.stubEnv("PAYMENT_EVIDENCE_ADMIN_IDS", other);
  await expect(createBluTestOrder(actor, { ...input(), requestId: randomUUID() })).rejects.toThrow("akun ini");
  vi.stubEnv("PAYMENT_EVIDENCE_PREVIEW", "false");
  await expect(createBluTestOrder(other, { ...input(), requestId: randomUUID() })).rejects.toThrow("belum diaktifkan");
  expect(await prisma.order.count()).toBe(count);
});
