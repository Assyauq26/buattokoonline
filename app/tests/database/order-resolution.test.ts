import {
  createJntAwb,
  handoverJntPackage,
} from "@/modules/shipping/jnt-fulfillment.service";
import { syncJntTracking } from "@/modules/shipping/jnt-tracking.service";
import { randomUUID, randomBytes } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const carrier = vi.hoisted(() => ({ create: vi.fn(), track: vi.fn() }));
vi.mock(
  "@/infrastructure/shipping/jnt/official-transport",
  async (original) => ({
    ...(await original<object>()),
    createJntOrder: carrier.create,
    trackJntOrder: carrier.track,
  }),
);
vi.mock("@/modules/shipping/shipping-settings.service", () => ({
  historicJntConfig: async () => ({
    environment: "sandbox",
    mappingVersion: "test",
    config: {
      seller: {
        warehouse: {
          name: "Test store",
          contact: "Test",
          address: "Jalan Contoh 1",
          phone: "081234567890",
          originCityCode: "BGG",
        },
      },
    },
  }),
}));
vi.mock("@/infrastructure/shipping/jnt/verified-mapping", () => ({
  getVerifiedJntDistrict: async () => ({
    destinationCityCode: "BGG",
    receiverArea: "BGG001",
  }),
}));

const storage = vi.hoisted(() => ({ put: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  STORAGE_APP: "store",
  putObject: storage.put,
  removeObject: storage.remove,
}));
import { prisma } from "@/lib/prisma";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
import {
  requestResolution,
  commandResolution,
  resolutionView,
  uploadResolutionFile,
  resolutionProof,
} from "@/modules/orders/resolution.service";
import {
  approvePayment,
  rejectPayment,
  submitConfirmation,
} from "@/modules/payments/payments.service";
import {
  listCustomerOrderPage,
  transitionOrder,
  completeOrderForBuyer,
} from "@/modules/orders/orders.service";
import { requestRefund } from "@/modules/payments/refund.service";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/management_v130_test"
)
  throw Error("Isolated local management database required");
let staff: { id: string; staff: true },
  buyer: { id: string; staff: false },
  other: { id: string; staff: false };
beforeAll(async () => {
  process.env.ORDER_DATA_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const role = await prisma.role.upsert({
    where: { name: "Admin" },
    update: {},
    create: { name: "Admin", label: "Test" },
  });
  for (const key of ALL_PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, label: key },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
      update: {},
      create: { roleId: role.id, permissionId: p.id },
    });
  }
  const user = async (name: string, admin = false) =>
    (
      await prisma.user.create({
        data: {
          name,
          email: randomUUID() + "@example.test",
          passwordHash: "disabled-test-login",
          ...(admin ? { roles: { create: { roleId: role.id } } } : {}),
        },
      })
    ).id;
  staff = { id: await user("Mock operator", true), staff: true };
  buyer = { id: await user("Mock buyer"), staff: false };
  other = { id: await user("Other buyer"), staff: false };
});
afterAll(async () => prisma.$disconnect());
async function fixture(paid = true, shipped = false) {
  const variant = await prisma.productVariant.create({
    data: {
      sku: randomUUID(),
      product: {
        create: {
          name: "Resolution fixture",
          slug: randomUUID(),
          basePrice: 10001,
        },
      },
      inventory: { create: { onHand: paid ? 8 : 10, reserved: paid ? 0 : 2 } },
    },
  });
  return prisma.order.create({
    data: {
      orderNumber: randomUUID(),
      userId: buyer.id,
      status: paid ? (shipped ? "COMPLETED" : "PACKED") : "PENDING_PAYMENT",
      paymentStatus: paid ? "PAID" : "PENDING_PAYMENT",
      subtotal: 20002,
      discount: 3,
      shippingCost: 7000,
      total: 26999,
      expiresAt: new Date(Date.now() + 3600000),
      items: {
        create: {
          variantId: variant.id,
          productName: "Immutable item",
          variantLabel: "One",
          quantity: 2,
          unitPrice: 10001,
          lineTotal: 20002,
        },
      },
      payment: {
        create: {
          amount: 26999,
          provider: "manual",
          status: paid ? "PAID" : "PENDING_PAYMENT",
        },
      },
      ...(shipped
        ? {
            shipment: {
              create: {
                provider: "manual",
                courier: "Mock courier",
                trackingNumber: randomUUID(),
                status: "DELIVERED",
                shippedDate: new Date(),
              },
            },
          }
        : {}),
    },
    include: { items: true, payment: true },
  });
}
const request = (id: string, kind = "CANCEL") =>
  requestResolution(id, staff, {
    requestId: randomUUID(),
    kind,
    reason: "Permintaan pengujian terisolasi",
  });
const view = (id: string) => resolutionView(id, staff);
async function command(
  id: string,
  orderId: string,
  action: string,
  fields: Record<string, unknown> = {},
) {
  const c = (await view(orderId)).cases.find((c) => c.id === id)!;
  return commandResolution(id, staff, {
    action,
    revision: c.revision,
    ...fields,
  });
}
async function bank(id: string, orderId: string) {
  const c = (await view(orderId)).cases.find((c) => c.id === id)!;
  await commandResolution(id, buyer, {
    action: "bank",
    revision: c.revision,
    bank: { bank: "Test Bank", holder: "Buyer", number: "0012345678" },
  });
}
const file = new TextEncoder().encode("%PDF-1.7\n synthetic private proof");
async function transfer(id: string, orderId: string, reference = randomUUID()) {
  let c = (await view(orderId)).cases.find((c) => c.id === id)!;
  if (c.state === "READY") {
    await commandResolution(id, staff, {
      action: "prepare-transfer",
      revision: c.revision,
      attested: true,
    });
    c = (await view(orderId)).cases.find((c) => c.id === id)!;
  }
  return uploadResolutionFile(
    id,
    staff,
    "transfer",
    {
      revision: String(c.revision),
      amount: String(c.refundAmount),
      reference,
      settledAt: new Date().toISOString(),
      attested: "true",
    },
    file,
    "application/pdf",
  );
}
it("unpaid cancellation releases reservations once under concurrent confirmation", async () => {
  const o = await fixture(false),
    c = await request(o.id);
  const results = await Promise.allSettled([
    commandResolution(c.id, staff, { action: "confirm-cancel", revision: 0 }),
    commandResolution(c.id, staff, { action: "confirm-cancel", revision: 0 }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await prisma.inventory.findUnique({
      where: { variantId: o.items[0].variantId },
    }),
  ).toMatchObject({ onHand: 10, reserved: 0 });
  expect(
    await prisma.inventoryMovement.count({
      where: { reference: o.orderNumber, type: "RELEASE" },
    }),
  ).toBe(1);
  expect((await view(o.id)).cases[0].state).toBe("CANCELLED_NO_REFUND");
  expect((await view(o.id)).remaining).toBe(0);
});
it("paid cancellation preserves paid dimension, restores stock once and requires full refund including shipping", async () => {
  const o = await fixture(),
    c = await request(o.id);
  await command(c.id, o.id, "confirm-cancel");
  const v = await view(o.id);
  expect(v.orderStatus).toBe("CANCELLED");
  expect(v.paymentStatus).toBe("PAID");
  expect(v.cases[0]).toMatchObject({
    refundAmount: 26999,
    shippingAmount: 7000,
    productsAmount: 19999,
    state: "WAITING_BANK",
  });
  expect(
    await prisma.inventory.findUnique({
      where: { variantId: o.items[0].variantId },
    }),
  ).toMatchObject({ onHand: 10, reserved: 0 });
  await expect(
    commandResolution(c.id, staff, { action: "confirm-cancel", revision: 0 }),
  ).rejects.toMatchObject({ status: 409 });
});
it("blocks foreign buyer reads, bank writes, case requests, proofs and staff impersonation", async () => {
  const o = await fixture(),
    c = await request(o.id);
  await command(c.id, o.id, "confirm-cancel");
  await expect(resolutionView(o.id, other)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    commandResolution(c.id, other, {
      action: "bank",
      revision: 1,
      bank: { bank: "Bad", holder: "Bad", number: "12345" },
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    requestResolution(o.id, other, {
      requestId: randomUUID(),
      kind: "RETURN",
      reason: "Bad request",
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    requestResolution(
      o.id,
      { ...other, staff: true },
      { requestId: randomUUID(), kind: "CANCEL", reason: "Bad request" },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await bank(c.id, o.id);
  await transfer(c.id, o.id);
  const v = await view(o.id);
  await expect(
    resolutionProof(v.cases[0].transfer!.id, other, "transfer"),
  ).rejects.toMatchObject({ status: 404 });
});
it("encrypts bank data with case binding and never projects ciphertext or source store account", async () => {
  const o = await fixture(),
    c = await request(o.id);
  await command(c.id, o.id, "confirm-cancel");
  await bank(c.id, o.id);
  const row = await prisma.orderResolution.findUniqueOrThrow({
    where: { id: c.id },
  });
  expect(row.bankCipher).not.toContain("0012345678");
  const v = await view(o.id);
  expect(v.cases[0].bank?.number).toBe("0012345678");
  expect(JSON.stringify(v)).not.toContain("bankCipher");
  expect(v.cases[0]).not.toHaveProperty("sourceAccountId");
});
it("records one manual refund, preserves seller claim vs buyer receipt and closes full payment only on receipt", async () => {
  const o = await fixture(),
    c = await request(o.id);
  await command(c.id, o.id, "confirm-cancel");
  await bank(c.id, o.id);
  const results = await Promise.allSettled([
    transfer(c.id, o.id),
    transfer(c.id, o.id),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  let v = await view(o.id);
  expect(v.paymentStatus).toBe("PAID");
  expect(v.cases[0].state).toBe("TRANSFER_RECORDED");
  await commandResolution(c.id, buyer, {
    action: "received",
    revision: v.cases[0].revision,
    attested: true,
  });
  v = await view(o.id);
  expect(v.paymentStatus).toBe("REFUNDED");
  expect(v.orderStatus).toBe("CANCELLED");
  expect(
    await prisma.resolutionTransfer.count({ where: { resolutionId: c.id } }),
  ).toBe(1);
});
it("dispute reserves funds, records follow-up, and prevents a second transfer", async () => {
  const o = await fixture(),
    c = await request(o.id);
  await command(c.id, o.id, "confirm-cancel");
  await bank(c.id, o.id);
  await transfer(c.id, o.id);
  let v = await view(o.id);
  await commandResolution(c.id, buyer, {
    action: "dispute",
    revision: v.cases[0].revision,
    reason: "Dana belum masuk",
  });
  await command(c.id, o.id, "follow-up", {
    note: "Kami memeriksa referensi bank pertama",
  });
  await expect(transfer(c.id, o.id)).rejects.toMatchObject({ status: 409 });
  expect((await view(o.id)).remaining).toBe(0);
});
it("supports partial refund snapshots and prevents quantity/amount reuse across cases", async () => {
  const o = await fixture(true, true),
    c = await request(o.id, "RETURN");
  await command(c.id, o.id, "approve-return", {
    items: [{ orderItemId: o.items[0].id, quantity: 1 }],
    shippingAmount: 0,
    returnRequired: false,
    policyReason: "Kompensasi satu produk sesuai kebijakan",
  });
  expect((await view(o.id)).cases[0].refundAmount).toBe(9999);
  await bank(c.id, o.id);
  await transfer(c.id, o.id);
  let v = await view(o.id);
  await commandResolution(c.id, buyer, {
    action: "received",
    revision: v.cases[0].revision,
    attested: true,
  });
  expect((await view(o.id)).paymentStatus).toBe("PAID");
  const c2 = await request(o.id, "RETURN");
  await expect(
    command(c2.id, o.id, "approve-return", {
      items: [{ orderItemId: o.items[0].id, quantity: 2 }],
      shippingAmount: 0,
      returnRequired: false,
      policyReason: "Refund berlebihan",
    }),
  ).rejects.toThrow();
  await command(c2.id, o.id, "approve-return", {
    items: [{ orderItemId: o.items[0].id, quantity: 1 }],
    shippingAmount: 7000,
    returnRequired: false,
    policyReason: "Sisa item dan ongkir",
  });
  expect((await view(o.id)).cases[0].refundAmount).toBe(17000);
});
it("does not restock return until inspection; parallel inspections add inventory only once", async () => {
  const o = await fixture(true, true),
    c = await request(o.id, "RETURN");
  await command(c.id, o.id, "approve-return", {
    items: [{ orderItemId: o.items[0].id, quantity: 1 }],
    shippingAmount: 0,
    returnRequired: true,
    policyReason: "Barang harus dikembalikan",
  });
  expect(
    (
      await prisma.inventory.findUniqueOrThrow({
        where: { variantId: o.items[0].variantId },
      })
    ).onHand,
  ).toBe(8);
  const input = {
    action: "inspect-return",
    revision: 1,
    restock: true,
    attested: true,
    note: "Barang fisik diterima dan layak jual",
  };
  const results = await Promise.allSettled([
    commandResolution(c.id, staff, input),
    commandResolution(c.id, staff, input),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (
      await prisma.inventory.findUniqueOrThrow({
        where: { variantId: o.items[0].variantId },
      })
    ).onHand,
  ).toBe(9);
  expect(
    await prisma.inventoryMovement.count({
      where: { reference: c.id, type: "RETURN" },
    }),
  ).toBe(1);
});
it("waiting payment cancellation cannot discard submitted proof without explicit funds review", async () => {
  const o = await fixture(false);
  await submitConfirmation(buyer.id, o.id, {
    senderBank: "Bank",
    senderName: "Buyer",
    amount: 26999,
    transferDate: new Date(),
    proofPath: "synthetic",
    proofMime: "application/pdf",
  });
  const c = await request(o.id);
  await command(c.id, o.id, "confirm-cancel");
  expect((await view(o.id)).cases[0].state).toBe("WAITING_PAYMENT");
  await approvePayment(o.payment!.id, staff.id);
  await command(c.id, o.id, "confirm-cancel");
  expect((await view(o.id)).cases[0].refundAmount).toBe(26999);
  expect((await view(o.id)).paymentStatus).toBe("PAID");
});
it("payment approval racing unpaid cancellation cannot leave paid money without a refund obligation", async () => {
  const o = await fixture(false);
  await submitConfirmation(buyer.id, o.id, {
    senderBank: "Bank",
    senderName: "Buyer",
    amount: 26999,
    transferDate: new Date(),
    proofPath: "synthetic",
    proofMime: "application/pdf",
  });
  const c = await request(o.id);
  await Promise.allSettled([
    approvePayment(o.payment!.id, staff.id),
    commandResolution(c.id, staff, {
      action: "confirm-cancel",
      revision: 0,
      fundsReview: "NOT_RECEIVED",
      attested: true,
    }),
  ]);
  const v = await view(o.id);
  if (v.paymentStatus === "PAID") {
    expect(v.orderStatus).toBe("CANCELLED");
    expect(v.cases[0].refundAmount).toBe(26999);
  } else {
    expect(v.orderStatus).toBe("CANCELLED");
    await expect(approvePayment(o.payment!.id, staff.id)).rejects.toMatchObject(
      { status: 409 },
    );
  }
});
it("correction remains reviewable past original deadline and never asks automatic second payment", async () => {
  const o = await fixture(false);
  await submitConfirmation(buyer.id, o.id, {
    senderBank: "Bank",
    senderName: "Buyer",
    amount: 26999,
    transferDate: new Date(),
    proofPath: "synthetic",
    proofMime: "application/pdf",
  });
  await rejectPayment(o.payment!.id, staff.id, "Bukti kurang jelas");
  await prisma.paymentConfirmation.updateMany({
    where: { paymentId: o.payment!.id },
    data: { createdAt: new Date(Date.now() - 2000) },
  });
  await prisma.order.update({
    where: { id: o.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await submitConfirmation(buyer.id, o.id, {
    senderBank: "Bank",
    senderName: "Buyer",
    amount: 26999,
    transferDate: new Date(),
    proofPath: "synthetic-corrected",
    proofMime: "application/pdf",
  });
  await approvePayment(o.payment!.id, staff.id);
  expect((await view(o.id)).paymentStatus).toBe("PAID");
});
it("requires cancelling active AWB first and freezes completion while refund is active", async () => {
  const o = await fixture();
  await prisma.shipment.create({
    data: {
      orderId: o.id,
      provider: "jnt",
      courier: "J&T Express",
      status: "PENDING",
      trackingNumber: "TEST-AWB",
    },
  });
  await prisma.jntShipmentRequest.create({
    data: {
      orderId: o.id,
      externalOrderId: randomUUID().slice(0, 20),
      state: "SUCCEEDED",
      awb: "TEST-AWB",
      requestedBy: staff.id,
      payloadFingerprint: "a".repeat(64),
    },
  });
  const c = await request(o.id);
  await command(c.id, o.id, "confirm-cancel");
  expect((await view(o.id)).cases[0].state).toBe("WAITING_SHIPMENT");
  expect((await view(o.id)).orderStatus).toBe("PACKED");
  await expect(
    transitionOrder(o.id, "SHIPPED", staff.id),
  ).rejects.toMatchObject({ status: 409 });
  await prisma.jntShipmentRequest.update({
    where: { orderId: o.id },
    data: { state: "CANCELLED" },
  });
  await prisma.shipment.update({
    where: { orderId: o.id },
    data: { cancelledAt: new Date() },
  });
  await command(c.id, o.id, "confirm-cancel");
  expect((await view(o.id)).cases[0].state).toBe("WAITING_BANK");
});
it("legacy full-refund cannot bypass a new approved partial obligation", async () => {
  const o = await fixture(true, true),
    c = await request(o.id, "RETURN");
  await command(c.id, o.id, "approve-return", {
    items: [{ orderItemId: o.items[0].id, quantity: 1 }],
    shippingAmount: 0,
    returnRequired: false,
    policyReason: "Kebijakan refund sebagian",
  });
  await expect(
    requestRefund(o.id, staff.id, {
      requestId: randomUUID(),
      amount: o.total,
      reason: "Percobaan bypass",
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it("request id replay produces no duplicate case or notification and rejects payload changes", async () => {
  const o = await fixture(),
    input = {
      requestId: randomUUID(),
      kind: "CANCEL",
      reason: "Stok bermasalah",
    };
  const c = await requestResolution(o.id, staff, input);
  expect(await requestResolution(o.id, staff, input)).toEqual(c);
  expect(
    await prisma.orderResolutionEvent.count({ where: { resolutionId: c.id } }),
  ).toBe(1);
  await expect(
    requestResolution(o.id, staff, { ...input, reason: "Payload berubah" }),
  ).rejects.toMatchObject({ status: 409 });
});

it("normal receipt completion is explicit, owner scoped, idempotent and blocked by open returns", async () => {
  const o = await fixture(true, true);
  await prisma.order.update({
    where: { id: o.id },
    data: { status: "DELIVERED" },
  });
  await expect(completeOrderForBuyer(o.id, other.id)).rejects.toMatchObject({
    status: 404,
  });
  const c = await request(o.id, "RETURN");
  await expect(completeOrderForBuyer(o.id, buyer.id)).rejects.toMatchObject({
    status: 409,
  });
  await command(c.id, o.id, "reject", {
    reason: "Bukti tidak memenuhi kebijakan toko",
  });
  await completeOrderForBuyer(o.id, buyer.id);
  expect(await completeOrderForBuyer(o.id, buyer.id)).toMatchObject({
    replayed: true,
  });
  expect((await view(o.id)).orderStatus).toBe("COMPLETED");
  expect(
    await prisma.orderStatusHistory.count({
      where: { orderId: o.id, toStatus: "COMPLETED" },
    }),
  ).toBe(1);
});

it("locks bank destination before manual transfer and rejects concurrent bank edits", async () => {
  const o = await fixture(),
    c = await request(o.id);
  await command(c.id, o.id, "confirm-cancel");
  await bank(c.id, o.id);
  await command(c.id, o.id, "prepare-transfer", { attested: true });
  const v = await view(o.id);
  await expect(
    commandResolution(c.id, buyer, {
      action: "bank",
      revision: v.cases[0].revision,
      bank: { bank: "Other", holder: "Other", number: "999999" },
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await view(o.id)).cases[0].bank?.number).toBe("0012345678");
});

it("normal payment -> packing -> mocked AWB -> seller handover -> carrier delivery -> buyer completion", async () => {
  process.env.JNT_API_ENV = "sandbox";
  process.env.JNT_ENABLE_ORDER_CREATE = "yes";
  const o = await fixture(false);
  await prisma.order.update({
    where: { id: o.id },
    data: {
      shippingWeightGram: 500,
      shippingMode: "official",
      shippingService: "EZ",
      shippingCourier: "J&T Express",
      address: {
        create: {
          recipientName: "Buyer",
          phone: "081234567890",
          line: "Jalan Contoh 1",
          province: "Jawa Tengah",
          city: "Batang",
          district: "Warungasem",
          provinceCode: "33",
          cityCode: "3325",
          districtCode: "3325010",
          postalCode: "",
        },
      },
    },
  });
  await submitConfirmation(buyer.id, o.id, {
    senderBank: "Bank",
    senderName: "Buyer",
    amount: o.total,
    transferDate: new Date(),
    proofPath: "synthetic",
    proofMime: "application/pdf",
  });
  await approvePayment(o.payment!.id, staff.id);
  await transitionOrder(o.id, "PROCESSING", staff.id);
  await transitionOrder(o.id, "PACKED", staff.id);
  carrier.create.mockImplementation(async (values) => ({
    orderId: values.orderid,
    awb: "TESTNORMAL123456",
    routingCode: null,
  }));
  await createJntAwb(o.id, staff.id);
  await handoverJntPackage(o.id, staff.id);
  expect((await view(o.id)).orderStatus).toBe("PACKED");
  const time = new Date(Date.now() - 1000 + 7 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  carrier.track.mockResolvedValue({
    awb: "TESTNORMAL123456",
    events: [{ code: "200", time, status: "Paket diterima", note: null }],
  });
  await syncJntTracking(o.id, false, staff.id);
  expect((await view(o.id)).orderStatus).toBe("DELIVERED");
  await completeOrderForBuyer(o.id, buyer.id);
  expect((await view(o.id)).orderStatus).toBe("COMPLETED");
  expect(
    (
      await prisma.inventory.findUniqueOrThrow({
        where: { variantId: o.items[0].variantId },
      })
    ).onHand,
  ).toBe(8);
  expect(carrier.create).toHaveBeenCalledTimes(1);
});

it("uses cancellation rather than a return before warehouse handover", async () => {
  const o = await fixture();
  await expect(request(o.id, "RETURN")).rejects.toMatchObject({ status: 409 });
  expect(await prisma.orderResolution.count({ where: { orderId: o.id } })).toBe(
    0,
  );
  expect((await request(o.id)).id).toBeTruthy();
});

it.each([false, true])(
  "keeps carrier delivery independent of refund receipt (receipt first: %s)",
  async (receiptFirst) => {
    const o = await fixture();
    const awb = "TEST" + randomUUID().replaceAll("-", "").slice(0, 16);
    await prisma.shipment.create({
      data: {
        orderId: o.id,
        provider: "jnt",
        courier: "J&T Express",
        status: "PENDING",
        trackingNumber: awb,
      },
    });
    await prisma.jntShipmentRequest.create({
      data: {
        orderId: o.id,
        externalOrderId: randomUUID().slice(0, 20),
        state: "SUCCEEDED",
        awb,
        requestedBy: staff.id,
        payloadFingerprint: "b".repeat(64),
      },
    });
    await handoverJntPackage(o.id, staff.id);
    const c = await request(o.id, "RETURN");
    await command(c.id, o.id, "approve-return", {
      items: [{ orderItemId: o.items[0].id, quantity: 2 }],
      shippingAmount: 7000,
      returnRequired: false,
      policyReason:
        "Kompensasi penuh tanpa pengembalian barang sesuai kebijakan",
    });
    await bank(c.id, o.id);
    await transfer(c.id, o.id);
    const receive = async () =>
      commandResolution(c.id, buyer, {
        action: "received",
        revision: (await view(o.id)).cases[0].revision,
        attested: true,
      });
    if (receiptFirst) await receive();
    const time = new Date(Date.now() - 1000 + 7 * 3600000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    carrier.track.mockResolvedValue({
      awb,
      events: [{ code: "200", time, status: "Paket diterima", note: null }],
    });
    await syncJntTracking(o.id, false, staff.id);
    const v = await view(o.id);
    expect(v.orderStatus).toBe("DELIVERED");
    if (!receiptFirst) {
      expect(v.cases[0].state).toBe("TRANSFER_RECORDED");
      await expect(completeOrderForBuyer(o.id, buyer.id)).rejects.toMatchObject(
        { status: 409 },
      );
      await receive();
    }
    expect((await view(o.id)).paymentStatus).toBe("REFUNDED");
    await completeOrderForBuyer(o.id, buyer.id);
    expect((await view(o.id)).orderStatus).toBe("COMPLETED");
    expect(
      (
        await prisma.inventory.findUniqueOrThrow({
          where: { variantId: o.items[0].variantId },
        })
      ).onHand,
    ).toBe(8);
  },
);

it("generic status endpoints cannot bypass cancellation reason and financial review", async () => {
  const o = await fixture(false);
  await expect(
    transitionOrder(o.id, "CANCELLED", staff.id),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    transitionOrder(o.id, "EXPIRED", staff.id),
  ).rejects.toMatchObject({ status: 409 });
  expect((await view(o.id)).orderStatus).toBe("PENDING_PAYMENT");
  expect(
    (
      await prisma.inventory.findUniqueOrThrow({
        where: { variantId: o.items[0].variantId },
      })
    ).reserved,
  ).toBe(2);
});

it("customer cancellation filtering, counts and pagination run across the entire owner-scoped dataset", async()=>{
 const prefix="PAG-"+randomUUID();
 await prisma.order.createMany({data:Array.from({length:26},(_,i)=>({orderNumber:prefix+"-"+i,userId:i===25?other.id:buyer.id,status:i<12?"CANCELLED":"PAID",paymentStatus:i<12?"EXPIRED":"PAID",subtotal:100,discount:0,shippingCost:0,total:100,createdAt:new Date(Date.now()+i*1000)}))});
 const result=await listCustomerOrderPage(buyer.id,{tab:"cancelled",q:prefix.toLowerCase(),page:2,pageSize:5});
 expect(result.total).toBe(12);expect(result.counts.all).toBe(25);expect(result.counts.cancelled).toBe(12);expect(result.orders).toHaveLength(5);expect(result.page).toBe(2);expect(result.pages).toBe(3);expect(result.orders.every(o=>o.userId===buyer.id&&o.status==="CANCELLED")).toBe(true);
 const last=await listCustomerOrderPage(buyer.id,{tab:"cancelled",q:prefix,page:999,pageSize:5});expect(last.page).toBe(3);expect(last.orders).toHaveLength(2);
});
