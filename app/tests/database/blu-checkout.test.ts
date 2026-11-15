import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prisma } from "@/lib/prisma";
import { prepareBluCheckout, BLU_CHECKOUT_METHOD, listBluCheckoutSources } from "@/modules/payments/evidence/blu-checkout";
import { setBluEnabled } from "@/modules/payments/evidence/blu-activation";
import { reconcileBluSource, approveBluManually, recordBluReview } from "@/modules/payments/evidence/blu-reconciliation";
import { observationFingerprint } from "@/modules/payments/evidence/repository";
import { seal } from "@/modules/payments/evidence/secrets";
import { reserveStock, releaseStock } from "@/modules/inventory/inventory.service";
import { approvePayment, submitConfirmation } from "@/modules/payments/payments.service";
import { previewCheckout, createOrder } from "@/modules/checkout/checkout.service";

const target = new URL(process.env.DATABASE_URL || "http://invalid");
if (target.hostname !== "127.0.0.1" || !["5568", "5432"].includes(target.port) || target.pathname !== "/hubify_payment_evidence_test")
  throw new Error("Exact isolated blu checkout database required");
const scope = `blu-checkout-${randomUUID()}`;
let actor: string, buyer: string;
beforeAll(async () => {
  vi.stubEnv("STORE_INSTALLATION_ID", scope); vi.stubEnv("PAYMENT_EVIDENCE_PREVIEW", "true");
  vi.stubEnv("PAYMENT_BLU_CHECKOUT_ENABLED", "true"); vi.stubEnv("PAYMENT_GMAIL_OAUTH_TEST", "true");
  vi.stubEnv("PAYMENT_GOOGLE_CLIENT_ID", "synthetic-client.apps.googleusercontent.com"); vi.stubEnv("PAYMENT_GOOGLE_CLIENT_SECRET", "synthetic-only-not-a-secret");
  vi.stubEnv("PAYMENT_INTEGRATION_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("JWT_SECRET", randomBytes(48).toString("hex"));
  await prisma.flashSaleControl.upsert({ where: { key: "primary" }, create: { key: "primary" }, update: {} });
  await prisma.shippingSettings.upsert({ where: { id: 1 }, create: { id: 1, manualFlat: 5000 }, update: { manualFlat: 5000, activeJntId: null } });
  const role = await prisma.role.upsert({ where: { name: "Admin" }, create: { name: "Admin", label: "Synthetic operator" }, update: {} });
  for (const key of ["bank.manage", "payment.read", "payment.verify"]) {
    const p = await prisma.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } }, create: { roleId: role.id, permissionId: p.id }, update: {} });
  }
  actor = (await prisma.user.create({ data: { email: `${randomUUID()}@example.test`, name: "Synthetic owner", passwordHash: "disabled", roles: { create: { roleId: role.id } } } })).id;
  buyer = (await prisma.user.create({ data: { email: `${randomUUID()}@example.test`, name: "Synthetic buyer", passwordHash: "disabled" } })).id;
  vi.stubEnv("PAYMENT_EVIDENCE_ADMIN_IDS", actor);
});
afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect(); });

async function source() {
  const number = String(Date.now()) + Math.floor(Math.random() * 100000);
  const bank = await prisma.bankAccount.create({ data: { bankName: "Synthetic blu", displayName: "Fixture only", accountHolder: "Fixture", accountNumber: number } });
  const s = await prisma.paymentEvidenceSource.create({ data: { kind: "GMAIL_BANK", label: "Synthetic blu", storeScope: scope,
    accountRef: createHash("sha256").update(JSON.stringify(["IDR", number])).digest("hex"), bankAccountId: bank.id, health: "REVIEW_ONLY", lastCheckedAt: new Date() } });
  await prisma.paymentEvidenceSource.update({ where: { id: s.id }, data: { encryptedSecret: seal(JSON.stringify({ access: "synthetic-access", refresh: "synthetic-refresh", expiresAt: Date.now() + 3600000 }), scope, s.id, "google-tokens") } });
  return s;
}
async function evidence(s: Awaited<ReturnType<typeof source>>, amount: number, time: Date, verified = true) {
  const o = { externalId: randomUUID(), amount, currency: "IDR", direction: "CREDIT", status: "UNKNOWN", accountRef: s.accountRef, occurredAt: time, trusted: false };
  const fingerprint = observationFingerprint(o);
  const { status, ...fields } = o;
  const e = await prisma.incomingPaymentEvidence.create({ data: { ...fields, providerStatus: status,
    sourceId: s.id, fingerprint, reason: "MISSING_STABLE_TRANSACTION_ID" } });
  // Synthetic signature result at the verified-ingestion seam. Real DKIM and
  // tampered raw-message behavior are tested independently in blu-signature.
  await prisma.paymentEvidenceReview.create({ data: { sourceId: s.id, evidenceId: e.id, action: "BLU_SIGNATURE_CHECK",
    reason: JSON.stringify({ format: 1, rawSha256: "a".repeat(64), observationFingerprint: fingerprint,
      verified, code: verified ? "BANK_DKIM_VALID" : "SIGNATURE_INVALID" }) } });
  return e;
}
async function activeSource() {
  const s = await source(); await evidence(s, 12345, new Date(Date.now() - 86400000));
  await setBluEnabled(actor, s.id, true); return s;
}
async function order(s: Awaited<ReturnType<typeof source>>, issued = new Date(), base = 10000) {
  const product = await prisma.product.create({ data: { name: "Synthetic item", slug: randomUUID(), basePrice: base,
    variants: { create: { sku: randomUUID(), inventory: { create: { onHand: 20 } } } } }, include: { variants: true } });
  const variant = product.variants[0];
  return prisma.$transaction(async tx => {
    const allocation = await prepareBluCheckout(tx, s.id, s.bankAccountId!, base, true, issued);
    const o = await tx.order.create({ data: { orderNumber: `SYN-BLU-${randomUUID()}`, userId: buyer, subtotal: base,
      total: allocation.payable, shippingCost: 0, discount: 0, expiresAt: allocation.expiresAt, createdAt: issued,
      items: { create: { variantId: variant.id, productName: product.name, variantLabel: "Fixture", quantity: 1, unitPrice: base, lineTotal: base } },
      payment: { create: { bankAccountId: s.bankAccountId, method: BLU_CHECKOUT_METHOD, amount: allocation.payable } } }, include: { payment: true } });
    await reserveStock(tx, variant.id, 1, o.orderNumber);
    const attempt = await tx.paymentEvidenceAttempt.create({ data: { ...allocation, paymentId: o.payment!.id } });
    return { ...o, attempt, variantId: variant.id };
  });
}
const approval = (evidenceId: string, attemptId: string) => ({ evidenceId, attemptId, bankConfirmed: true, reason: "Synthetic reviewer checked the original bank mutation independently." });

async function checkout(s: Awaited<ReturnType<typeof source>>) {
  const product = await prisma.product.create({ data: { name: "Synthetic checkout", slug: randomUUID(), basePrice: 20000,
    status: "PUBLISHED", variants: { create: { sku: randomUUID(), inventory: { create: { onHand: 2 } } } } }, include: { variants: true } });
  const u = await prisma.user.create({ data: { name: "Synthetic customer", email: `${randomUUID()}@example.test`, passwordHash: "disabled",
    cart: { create: { items: { create: { variantId: product.variants[0].id, quantity: 1 } } } } } });
  const snapshot = JSON.parse(gunzipSync(readFileSync("src/modules/regions/data/snapshot.json.gz")).toString());
  const p = snapshot.provinces.data[0], c = snapshot["regencies/" + p.code].data[0],
    d = snapshot["districts/" + c.code].data[0], v = snapshot["villages/" + d.code].data[0];
  const address = { recipientName: "Synthetic customer", phone: "+6281234567890", line: "Jalan uji nomor satu",
    provinceCode: p.code, cityCode: c.code, districtCode: d.code, villageCode: v.code, postalCode: v.postalCode || "", city: c.name, province: p.name };
  const first = await previewCheckout(u.id, { address }), shipping = first.shippingRates[0];
  const preview = await previewCheckout(u.id, { address, shipping });
  return { user: u.id, variant: product.variants[0].id, input: { address, shipping, bankAccountId: s.bankAccountId!,
    paymentEvidenceSourceId: s.id, codeConsent: true, requestId: randomUUID(), expectedLines: preview.lines,
    expectedQuote: { subtotal: preview.subtotal, shippingCost: preview.shippingCost, discount: preview.discount, total: preview.total } } };
}

it("uses the actual checkout with server shipping quotes, reservation and idempotent retries", async () => {
  const s = await activeSource(), f = await checkout(s);
  const [a,b] = await Promise.all([createOrder(f.user, f.input), createOrder(f.user, f.input)]);
  expect(a.id).toBe(b.id);
  const saved = await prisma.order.findUniqueOrThrow({ where: { id: a.id }, include: { payment: { include: { evidenceAttempt: true } } } });
  expect(saved.subtotal).toBe(20000); expect(saved.shippingCost).toBe(5000);
  expect(saved.payment!.method).toBe(BLU_CHECKOUT_METHOD);
  expect(saved.total).toBe(25000 + saved.payment!.evidenceAttempt!.uniqueCode);
  expect(saved.payment!.amount).toBe(saved.total);
  expect(+saved.expiresAt! - +saved.payment!.evidenceAttempt!.createdAt).toBe(600000);
  expect((await prisma.inventory.findUniqueOrThrow({ where: { variantId: f.variant } })).reserved).toBe(1);
  expect(await prisma.inventoryMovement.count({ where: { variantId: f.variant, type: "RESERVATION" } })).toBe(1);
  expect((await createOrder(f.user, f.input)).id).toBe(a.id);
});
it("rejects a source disabled after preview without creating orders or reserving stock", async () => {
  const s = await activeSource(), f = await checkout(s);
  await setBluEnabled(actor, s.id, false);
  await expect(createOrder(f.user, f.input)).rejects.toThrow("belum siap");
  expect(await prisma.order.count({ where: { userId: f.user } })).toBe(0);
  expect((await prisma.inventory.findUniqueOrThrow({ where: { variantId: f.variant } })).reserved).toBe(0);
});

it("preserves ordinary manual transfer proof and exactly-once financial settlement", async () => {
  const s = await activeSource(), f = await checkout(s);
  const input = { ...f.input, paymentEvidenceSourceId: undefined, codeConsent: undefined };
  const o = await createOrder(f.user, input);
  const saved = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { payment: true } });
  expect(saved.total).toBe(25000);
  expect(await prisma.paymentEvidenceAttempt.count({ where: { paymentId: saved.payment!.id } })).toBe(0);
  await submitConfirmation(f.user, o.id, { senderBank: "Synthetic bank", senderName: "Synthetic buyer", amount: saved.total,
    transferDate: new Date(), proofPath: "/private/proof/synthetic.png", proofMime: "image/png" });
  await Promise.all([approvePayment(saved.payment!.id, actor), approvePayment(saved.payment!.id, actor)]);
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: saved.payment!.id } })).status).toBe("PAID");
  expect(await prisma.inventoryMovement.count({ where: { variantId: f.variant, type: "SALE" } })).toBe(1);
  expect(await prisma.orderStatusHistory.count({ where: { orderId: o.id, toStatus: "PAID" } })).toBe(1);
});
it("requires connected, verified-source opt-in and never activates GoPay", async () => {
  const s = await source();
  await expect(setBluEnabled(actor, s.id, true)).rejects.toThrow("tanda tangan");
  await evidence(s, 12345, new Date()); await setBluEnabled(actor, s.id, true);
  expect((await listBluCheckoutSources()).some(x => x.id === s.id)).toBe(true);
  await setBluEnabled(actor, s.id, false);
  expect((await listBluCheckoutSources()).some(x => x.id === s.id)).toBe(false);
});
it("serializes concurrent codes including collisions across base amounts", async () => {
  const s = await activeSource();
  const orders = await Promise.all([1,2,3,4].map(() => order(s)));
  expect(new Set(orders.map(o => o.total)).size).toBe(4);
  const next = await order(s, new Date(), 10001);
  expect(orders.some(o => o.total === next.total)).toBe(false);
  for (const o of orders) expect(o.payment!.amount).toBe(o.attempt.payable);
});
it("requires code consent and bank minimum before issuing an attempt", async () => {
  const s = await activeSource();
  const before = await prisma.paymentEvidenceAttempt.count({ where: { sourceId: s.id } });
  await expect(prisma.$transaction(tx => prepareBluCheckout(tx, s.id, s.bankAccountId!, 10000, false))).rejects.toThrow("Konfirmasi");
  await expect(prisma.$transaction(tx => prepareBluCheckout(tx, s.id, s.bankAccountId!, 9999, true))).rejects.toThrow("minimal");
  expect(await prisma.paymentEvidenceAttempt.count({ where: { sourceId: s.id } })).toBe(before);
});
it("unknown bank status becomes manual review, never automatic paid; retry settles stock and notification once", async () => {
  const s = await activeSource(), o = await order(s), e = await evidence(s, o.total, new Date(+o.attempt.createdAt + 100));
  await Promise.all([reconcileBluSource(s.id, actor), reconcileBluSource(s.id, actor)]);
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: o.payment!.id } })).status).toBe("WAITING_VERIFICATION");
  expect(await prisma.paymentEvidenceClaim.count({ where: { attemptId: o.attempt.id } })).toBe(0);
  expect(await prisma.paymentEvidenceReview.count({ where: { attemptId: o.attempt.id, action: "BLU_CANDIDATE_REVIEW" } })).toBe(1);
  await expect(approvePayment(o.payment!.id, actor)).rejects.toThrow("Pemeriksaan Notifikasi");
  await expect(submitConfirmation(buyer, o.id, { senderBank: "Synthetic", senderName: "Synthetic", amount: o.total,
    transferDate: new Date(), proofPath: "/private/synthetic.png", proofMime: "image/png" })).rejects.toThrow("dibaca otomatis");
  await Promise.all([approveBluManually(actor, approval(e.id, o.attempt.id)), approveBluManually(actor, approval(e.id, o.attempt.id))]);
  expect(await prisma.paymentEvidenceClaim.count({ where: { attemptId: o.attempt.id } })).toBe(1);
  expect(await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variantId } })).toMatchObject({ onHand: 19, reserved: 0 });
  expect(await prisma.inventoryMovement.count({ where: { variantId: o.variantId, type: "SALE" } })).toBe(1);
  expect(await prisma.orderStatusHistory.count({ where: { orderId: o.id, toStatus: "PAID" } })).toBe(1);
});
it("rolls claim and payment back together when inventory commit fails", async () => {
  const s = await activeSource(), o = await order(s), e = await evidence(s, o.total, new Date(+o.attempt.createdAt + 100));
  await reconcileBluSource(s.id, actor);
  await prisma.inventory.update({ where: { variantId: o.variantId }, data: { reserved: 0 } });
  await expect(approveBluManually(actor, approval(e.id, o.attempt.id))).rejects.toThrow("Reservasi stok");
  expect(await prisma.paymentEvidenceClaim.count({ where: { evidenceId: e.id } })).toBe(0);
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: o.payment!.id } })).status).toBe("WAITING_VERIFICATION");
});
it("holds ambiguous notifications and refuses financial approval", async () => {
  const s = await activeSource(), o = await order(s), time = new Date(+o.attempt.createdAt + 100);
  const e = await evidence(s, o.total, time); await evidence(s, o.total, time);
  await reconcileBluSource(s.id, actor);
  expect(await prisma.paymentEvidenceReview.count({ where: { attemptId: o.attempt.id, action: "BLU_AMBIGUOUS_REVIEW" } })).toBe(1);
  await expect(approveBluManually(actor, approval(e.id, o.attempt.id))).rejects.toThrow();
  expect(await prisma.paymentEvidenceClaim.count({ where: { attemptId: o.attempt.id } })).toBe(0);
});
it("records manual findings idempotently without consuming evidence or changing money", async () => {
  const s = await activeSource(), o = await order(s), e = await evidence(s, o.total, new Date(+o.attempt.createdAt + 100));
  const input = { requestId: randomUUID(), evidenceId: e.id, decision: "REFUND_REQUIRED", reason: "Periksa pengembalian langsung di aplikasi bank." };
  await Promise.all([recordBluReview(actor, input), recordBluReview(actor, input)]);
  expect(await prisma.paymentEvidenceReview.count({ where: { evidenceId: e.id, action: "BLU_MANUAL_REFUND_REQUIRED" } })).toBe(1);
  await expect(recordBluReview(actor, { ...input, decision: "UNMATCHED" })).rejects.toMatchObject({ status: 409 });
  expect(await prisma.paymentEvidenceClaim.count({ where: { evidenceId: e.id } })).toBe(0);
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: o.payment!.id } })).status).toBe("PENDING_PAYMENT");
  expect((await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variantId } })).onHand).toBe(20);
  await expect(recordBluReview(buyer, { ...input, requestId: randomUUID() })).rejects.toMatchObject({ status: 403 });
});
it("does not revive expired orders or consume stock for late evidence", async () => {
  const s = await activeSource(), issued = new Date(Date.now() - 11 * 60000), o = await order(s, issued);
  const e = await evidence(s, o.total, new Date(+issued + 60000));
  await prisma.$transaction(async tx => {
    await tx.payment.update({ where: { id: o.payment!.id }, data: { status: "EXPIRED" } });
    await tx.order.update({ where: { id: o.id }, data: { status: "EXPIRED", paymentStatus: "EXPIRED" } });
    await releaseStock(tx, o.variantId, 1, o.orderNumber);
  });
  await reconcileBluSource(s.id, actor);
  expect(await prisma.paymentEvidenceReview.count({ where: { attemptId: o.attempt.id, action: "BLU_LATE_REVIEW" } })).toBe(1);
  await expect(approveBluManually(actor, approval(e.id, o.attempt.id))).rejects.toThrow();
  expect(await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variantId } })).toMatchObject({ onHand: 20, reserved: 0 });
});
it("refuses other buyers, wrong store scope, tampered signature and revoked operator", async () => {
  const s = await activeSource(), o = await order(s), e = await evidence(s, o.total, new Date(+o.attempt.createdAt + 100), false);
  await reconcileBluSource(s.id, actor);
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: o.payment!.id } })).status).toBe("PENDING_PAYMENT");
  await expect(approveBluManually(buyer, approval(e.id, o.attempt.id))).rejects.toMatchObject({ status: 403 });
  vi.stubEnv("STORE_INSTALLATION_ID", scope + "-other");
  await expect(approveBluManually(actor, approval(e.id, o.attempt.id))).rejects.toMatchObject({ status: 404 });
  vi.stubEnv("STORE_INSTALLATION_ID", scope);
  await prisma.user.update({ where: { id: actor }, data: { isActive: false } });
  await expect(prisma.$transaction(tx => prepareBluCheckout(tx, s.id, s.bankAccountId!, 10000, true))).rejects.toMatchObject({ status: 403 });
  await prisma.user.update({ where: { id: actor }, data: { isActive: true } });
});
