import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const carrier = vi.hoisted(() => ({
  cancel: vi.fn(),
  create: vi.fn(),
  track: vi.fn(),
}));
vi.mock(
  "@/infrastructure/shipping/jnt/official-transport",
  async (original) => ({
    ...(await original<object>()),
    cancelJntOrder: carrier.cancel,
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
          name: "Test Store",
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
import { JntCancellationRejected } from "@/infrastructure/shipping/jnt/official-transport";
import { prisma } from "@/lib/prisma";
import {
  cancelJntAwb,
  createJntAwb,
  handoverJntPackage,
  reconcileJntCancellation,
  reconcileJntCreation,
  getJntTracking,
} from "@/modules/shipping/jnt-fulfillment.service";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { syncJntTracking } from "@/modules/shipping/jnt-tracking.service";
import { commandResolution } from "@/modules/orders/resolution.service";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/management_v130_test"
)
  throw new Error("Requires isolated local management_v130_test database");
let staff: string;
beforeAll(async () => {
  process.env.JNT_API_ENV = "sandbox";
  process.env.JNT_ENABLE_CANCELLATION = "yes";
  process.env.JNT_ENABLE_ORDER_CREATE = "yes";
  const role = await prisma.role.upsert({
    where: { name: "Admin" },
    update: {},
    create: { name: "Admin", label: "Test" },
  });
  for (const key of [
    PERMISSIONS.SHIPPING_READ,
    PERMISSIONS.SHIPPING_CREATE,
    PERMISSIONS.SHIPPING_UPDATE,
  ]) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, label: key },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
  staff = (
    await prisma.user.create({
      data: {
        name: "Mock carrier operator",
        email: `${randomUUID()}@example.test`,
        passwordHash: "disabled-test-login",
        roles: { create: { roleId: role.id } },
      },
    })
  ).id;
});
beforeEach(() => {
  vi.clearAllMocks();
  carrier.cancel.mockResolvedValue({ cancelled: true });
  carrier.create.mockImplementation(async (values) => ({
    orderId: values.orderid,
    awb: "TEST" + randomUUID().replaceAll("-", "").slice(0, 15).toUpperCase(),
    routingCode: null,
  }));
});
afterAll(async () => prisma.$disconnect());
const cancellationEvent = {
  code: "162",
  status: "Cancelled AWB by Seller",
  time: "2026-01-02 10:00:00",
  note: null,
};
async function refundFixture(
  orderId: string,
  state = "RECEIVED",
  amount = 10000,
) {
  return prisma.orderResolution.create({
    data: {
      orderId,
      requestKey: randomUUID(),
      fingerprint: "f".repeat(64),
      kind: "RETURN",
      state,
      reason: "Synthetic refund",
      refundAmount: amount,
      productsAmount: amount,
      items: [],
      returnState: "INSPECTED",
      stockRestored: true,
      createdBy: staff,
      transfer: {
        create: {
          amount,
          referenceDigest: randomUUID(),
          reference: "Synthetic transfer",
          bankDigest: "b".repeat(64),
          proofPath: "private/synthetic",
          proofMime: "image/png",
          proofHash: "c".repeat(64),
          settledAt: new Date(),
          recordedBy: staff,
        },
      },
    },
  });
}
async function fixture() {
  const variant = await prisma.productVariant.create({
    data: {
      sku: randomUUID(),
      product: {
        create: { name: "Synthetic", slug: randomUUID(), basePrice: 10000 },
      },
      inventory: { create: { onHand: 5, reserved: 0 } },
    },
  });
  return prisma.order.create({
    data: {
      userId: staff,
      orderNumber: randomUUID(),
      status: "PACKED",
      paymentStatus: "PAID",
      subtotal: 10000,
      total: 10000,
      shippingCourier: "J&T Express",
      shippingMode: "official",
      shippingService: "EZ",
      shippingWeightGram: 400,
      payment: { create: { amount: 10000, status: "PAID" } },
      items: {
        create: {
          variantId: variant.id,
          productName: "Synthetic",
          variantLabel: "One",
          quantity: 1,
          unitPrice: 10000,
          lineTotal: 10000,
        },
      },
      address: {
        create: {
          recipientName: "Test",
          phone: "081234567890",
          line: "Jalan Contoh 1",
          province: "Aceh",
          city: "Kabupaten",
          district: "Kecamatan",
          provinceCode: "11",
          cityCode: "1101",
          districtCode: "1101010",
          postalCode: "",
        },
      },
      shipment: {
        create: {
          provider: "jnt",
          courier: "J&T Express",
          status: "PENDING",
          trackingNumber: "TEST12345678",
        },
      },
      jntShipmentRequest: {
        create: {
          externalOrderId: randomUUID()
            .replaceAll("-", "")
            .slice(0, 20)
            .toUpperCase(),
          payloadFingerprint: "a".repeat(64),
          state: "SUCCEEDED",
          awb: "TEST12345678",
          requestedBy: staff,
        },
      },
    },
    include: { payment: true, jntShipmentRequest: true },
  });
}
it("cancels once concurrently, preserves paid active order, and blocks handover", async () => {
  const order = await fixture();
  const results = await Promise.allSettled([
    cancelJntAwb(order.id, staff, "Data pengiriman salah"),
    cancelJntAwb(order.id, staff, "Data pengiriman salah"),
  ]);
  expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  expect(carrier.cancel).toHaveBeenCalledTimes(1);
  expect(
    await cancelJntAwb(order.id, staff, "Data pengiriman salah"),
  ).toMatchObject({ replayed: true });
  const current = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { shipment: true, payment: true },
  });
  expect(current.status).toBe("PACKED");
  expect(current.payment?.status).toBe("PAID");
  expect(current.shipment?.cancelledAt).not.toBeNull();
  await expect(handoverJntPackage(order.id, staff)).rejects.toMatchObject({
    status: 409,
  });
});
it("rejects cancellation after physical pickup", async () => {
  const order = await fixture();
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "SHIPPED", shipment: { update: { status: "SHIPPED" } } },
  });
  await expect(
    cancelJntAwb(order.id, staff, "Data pengiriman salah"),
  ).rejects.toMatchObject({ status: 409 });
  expect(carrier.cancel).not.toHaveBeenCalled();
});
it("rejects a stale page identity before cancel dispatch or manual reconciliation", async () => {
  const order = await fixture();
  await expect(
    cancelJntAwb(order.id, staff, "Data salah", "SO-STALE-PAGE"),
  ).rejects.toMatchObject({ status: 409 });
  expect(carrier.cancel).not.toHaveBeenCalled();
  expect(
    (
      await prisma.jntShipmentRequest.findUniqueOrThrow({
        where: { orderId: order.id },
      })
    ).state,
  ).toBe("SUCCEEDED");
  await prisma.jntShipmentRequest.update({
    where: { orderId: order.id },
    data: {
      state: "UNKNOWN",
      errorCode: "CANCELLATION_PENDING",
      updatedAt: new Date(Date.now() - 360000),
    },
  });
  await expect(
    reconcileJntCancellation(order.id, staff, {
      attested: true,
      evidenceReference: "MOCK-CASE-123456",
      expectedExternalOrderId: "SO-STALE-PAGE",
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } }))
      .cancelledAt,
  ).toBeNull();
});
it("keeps failed and uncertain cancellation blocked until verified reconciliation", async () => {
  const order = await fixture();
  carrier.cancel.mockRejectedValueOnce(new Error("mock transport timeout"));
  await expect(
    cancelJntAwb(order.id, staff, "Data pengiriman salah"),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    cancelJntAwb(order.id, staff, "Data pengiriman salah"),
  ).rejects.toMatchObject({ status: 409 });
  await expect(createJntAwb(order.id, staff)).rejects.toMatchObject({
    status: 409,
  });
  expect(carrier.cancel).toHaveBeenCalledTimes(1);
  expect(carrier.create).not.toHaveBeenCalled();
  await expect(
    reconcileJntCancellation(order.id, staff, {
      attested: true,
      evidenceReference: "MOCK-CASE-123456",
    }),
  ).rejects.toMatchObject({ status: 409 });
  await prisma.jntShipmentRequest.update({
    where: { orderId: order.id },
    data: { updatedAt: new Date(Date.now() - 360000) },
  });
  await expect(
    reconcileJntCancellation(order.id, staff, {
      attested: false,
      evidenceReference: "MOCK-CASE-123456",
    }),
  ).rejects.toMatchObject({ status: 422 });
  expect(
    await reconcileJntCancellation(order.id, staff, {
      attested: true,
      evidenceReference: "MOCK-CASE-123456",
    }),
  ).toMatchObject({ cancelled: true });
  expect(
    await prisma.auditLog.count({
      where: { entityId: order.id, action: "jnt.cancel.reconciled" },
    }),
  ).toBe(1);
});
it("archives cancelled attempt before one concurrent reissue, uses a new external ID", async () => {
  const order = await fixture();
  await cancelJntAwb(order.id, staff, "Data pengiriman salah");
  const results = await Promise.allSettled([
    createJntAwb(order.id, staff),
    createJntAwb(order.id, staff),
  ]);
  expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  expect(carrier.create).toHaveBeenCalledTimes(1);
  const history = await prisma.jntShipmentAttempt.findMany({
    where: { orderId: order.id },
  });
  expect(history).toHaveLength(1);
  expect(history[0].externalOrderId).toBe(
    order.jntShipmentRequest?.externalOrderId,
  );
  expect(history[0].awb).toBe("TEST12345678");
  const current = await prisma.jntShipmentRequest.findUniqueOrThrow({
    where: { orderId: order.id },
  });
  expect(current.externalOrderId).not.toBe(history[0].externalOrderId);
  expect(current.state).toBe("SUCCEEDED");
});
it("does not issue or cancel while refund is active", async () => {
  const order = await fixture();
  await prisma.paymentEvent.create({
    data: {
      paymentId: order.payment!.id,
      type: "REFUND_REQUESTED",
      externalId: randomUUID(),
      payload: {},
    },
  });
  await expect(
    cancelJntAwb(order.id, staff, "Data pengiriman salah"),
  ).rejects.toMatchObject({ status: 409 });
  expect(carrier.cancel).not.toHaveBeenCalled();
});

it("definitive per-order rejection preserves active AWB instead of marking cancelled", async () => {
  const order = await fixture();
  carrier.cancel.mockRejectedValueOnce(new JntCancellationRejected());
  await expect(
    cancelJntAwb(order.id, staff, "Data salah"),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await prisma.jntShipmentRequest.findUnique({
      where: { orderId: order.id },
    }),
  ).toMatchObject({ state: "SUCCEEDED", errorCode: "CANCELLATION_REJECTED" });
  expect(
    (await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } }))
      .cancelledAt,
  ).toBeNull();
});
it("seller handover is a separate fact; carrier can still confirm cancellation before pickup", async () => {
  const order = await fixture();
  await handoverJntPackage(order.id, staff);
  const o = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { shipment: true },
  });
  expect(o.status).toBe("PACKED");
  expect(o.shipment?.status).toBe("PENDING");
  expect(o.shipment?.sellerHandoverAt).not.toBeNull();
  await expect(
    cancelJntAwb(order.id, staff, "Data salah"),
  ).resolves.toMatchObject({
    cancelled: true,
    orderNumber: order.orderNumber,
    externalOrderId: order.jntShipmentRequest!.externalOrderId,
  });
  expect(carrier.cancel).toHaveBeenCalledWith(
    order.jntShipmentRequest!.externalOrderId,
    "Data salah",
    expect.anything(),
  );
  expect(
    (await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } }))
      .sellerHandoverAt,
  ).not.toBeNull();
});
it("cancel vs seller statement is serialized; cancellation wins and cannot be handed over again", async () => {
  const order = await fixture();
  const results = await Promise.allSettled([
    handoverJntPackage(order.id, staff),
    cancelJntAwb(order.id, staff, "Salah data"),
  ]);
  const current = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { shipment: true, jntShipmentRequest: true },
  });
  expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  expect(current.jntShipmentRequest?.state).toBe("CANCELLED");
  expect(current.shipment?.cancelledAt).not.toBeNull();
  await expect(handoverJntPackage(order.id, staff)).rejects.toMatchObject({
    status: 409,
  });
});
it("heals an already-persisted cancellation timestamp and closes a fully acknowledged refund exactly once", async () => {
  const order = await fixture();
  await handoverJntPackage(order.id, staff);
  const c = await refundFixture(order.id);
  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "REFUNDED",
      payment: { update: { status: "REFUNDED" } },
      shipment: {
        update: {
          carrierEventAt: new Date("2026-01-02T03:00:00Z"),
          events: {
            create: {
              status: "PENDING",
              description: cancellationEvent.status,
              occurredAt: new Date("2026-01-02T03:00:00Z"),
            },
          },
        },
      },
    },
  });
  const money = await prisma.payment.findUnique({
    where: { orderId: order.id },
  });
  const refund = await prisma.orderResolution.findUnique({
    where: { id: c.id },
    include: { transfer: true },
  });
  const variants = (
    await prisma.orderItem.findMany({
      where: { orderId: order.id },
      select: { variantId: true },
    })
  ).map((i) => i.variantId);
  const inventory = await prisma.inventory.findMany({
    where: { variantId: { in: variants } },
    orderBy: { variantId: "asc" },
  });
  const movements = await prisma.inventoryMovement.count({
    where: { variantId: { in: variants } },
  });
  carrier.track.mockResolvedValue({
    awb: "TEST12345678",
    events: [cancellationEvent],
  });
  await Promise.all([syncJntTracking(order.id), syncJntTracking(order.id)]);
  const current = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { shipment: true, jntShipmentRequest: true },
  });
  expect(current.status).toBe("CANCELLED");
  expect(current.paymentStatus).toBe("REFUNDED");
  expect(current.jntShipmentRequest?.state).toBe("CANCELLED");
  expect(current.shipment?.sellerHandoverAt).not.toBeNull();
  expect(
    await prisma.payment.findUnique({ where: { orderId: order.id } }),
  ).toEqual(money);
  expect(
    await prisma.orderResolution.findUnique({
      where: { id: c.id },
      include: { transfer: true },
    }),
  ).toEqual(refund);
  expect(
    await prisma.inventory.findMany({
      where: { variantId: { in: variants } },
      orderBy: { variantId: "asc" },
    }),
  ).toEqual(inventory);
  expect(
    await prisma.inventoryMovement.count({
      where: { variantId: { in: variants } },
    }),
  ).toBe(movements);
  expect(
    await prisma.orderStatusHistory.count({
      where: { orderId: order.id, toStatus: "CANCELLED" },
    }),
  ).toBe(1);
  expect(
    await prisma.shipmentEvent.count({
      where: {
        shipmentId: current.shipment!.id,
        description: cancellationEvent.status,
      },
    }),
  ).toBe(1);
  expect(carrier.cancel).not.toHaveBeenCalled();
  expect(carrier.create).not.toHaveBeenCalled();
});
it("closes in reverse order when buyer acknowledges full refund after the AWB was cancelled", async () => {
  const order = await fixture();
  await cancelJntAwb(order.id, staff, "Salah data");
  const c = await refundFixture(order.id, "TRANSFER_RECORDED");
  await commandResolution(
    c.id,
    { id: staff, staff: false },
    { action: "received", revision: 0, attested: true },
  );
  expect(
    await prisma.order.findUnique({ where: { id: order.id } }),
  ).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
  expect(
    (
      await prisma.resolutionTransfer.findUniqueOrThrow({
        where: { resolutionId: c.id },
      })
    ).amount,
  ).toBe(10000);
});
it("does not close paid orders for AWB cancellation alone or incomplete refund acknowledgements", async () => {
  const order = await fixture();
  carrier.track.mockResolvedValue({
    awb: "TEST12345678",
    events: [cancellationEvent],
  });
  await syncJntTracking(order.id);
  expect(
    await prisma.order.findUnique({ where: { id: order.id } }),
  ).toMatchObject({ status: "PACKED", paymentStatus: "PAID" });
  const partial = await fixture();
  await refundFixture(partial.id, "RECEIVED", 1000);
  await prisma.order.update({
    where: { id: partial.id },
    data: {
      paymentStatus: "REFUNDED",
      payment: { update: { status: "REFUNDED" } },
    },
  });
  await syncJntTracking(partial.id);
  expect(
    (await prisma.order.findUniqueOrThrow({ where: { id: partial.id } }))
      .status,
  ).toBe("PACKED");
});
it("reconciles an uncertain cancel using tracking without another cancel dispatch", async () => {
  const order = await fixture();
  await prisma.jntShipmentRequest.update({
    where: { orderId: order.id },
    data: { state: "UNKNOWN", errorCode: "CANCELLATION_PENDING" },
  });
  carrier.track.mockResolvedValue({
    awb: "TEST12345678",
    events: [cancellationEvent],
  });
  expect(await getJntTracking(order.id, staff)).toMatchObject({
    cancelled: true,
  });
  expect(carrier.cancel).not.toHaveBeenCalled();
});
it("never closes a genuine shipped return as a pre-dispatch cancellation", async () => {
  const order = await fixture();
  await refundFixture(order.id);
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "SHIPPED",
      paymentStatus: "REFUNDED",
      payment: { update: { status: "REFUNDED" } },
      shipment: {
        update: {
          status: "IN_TRANSIT",
          shippedDate: new Date("2026-01-01T00:00:00Z"),
          events: {
            create: {
              status: "IN_TRANSIT",
              description: "Carrier pickup",
              occurredAt: new Date("2026-01-01T00:00:00Z"),
            },
          },
        },
      },
    },
  });
  carrier.track.mockResolvedValue({
    awb: "TEST12345678",
    events: [cancellationEvent],
  });
  expect(await syncJntTracking(order.id)).toMatchObject({
    cancelled: true,
    orderClosed: false,
  });
  expect(
    await prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
  ).toMatchObject({ status: "SHIPPED", paymentStatus: "REFUNDED" });
  expect(carrier.cancel).not.toHaveBeenCalled();
});
it("allows stopping an uncollected AWB during a return case but keeps fulfillment and refund records frozen", async () => {
  const order = await fixture();
  const c = await refundFixture(order.id, "READY");
  const before = await prisma.orderResolution.findUnique({
    where: { id: c.id },
    include: { transfer: true },
  });
  await expect(createJntAwb(order.id, staff)).resolves.toMatchObject({
    replayed: true,
  });
  await expect(handoverJntPackage(order.id, staff)).rejects.toMatchObject({
    status: 409,
  });
  await expect(
    cancelJntAwb(order.id, staff, "Pesanan dibatalkan"),
  ).resolves.toMatchObject({ cancelled: true });
  expect(
    await prisma.orderResolution.findUnique({
      where: { id: c.id },
      include: { transfer: true },
    }),
  ).toEqual(before);
  expect(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .paymentStatus,
  ).toBe("PAID");
  await expect(createJntAwb(order.id, staff)).rejects.toMatchObject({
    status: 409,
  });
});
it("keeps physical pickup truth when pickup races a carrier cancellation rejection", async () => {
  const order = await fixture();
  let begin!: () => void, reject!: (error: unknown) => void;
  const started = new Promise<void>((r) => {
    begin = r;
  });
  carrier.cancel.mockImplementationOnce(() => {
    begin();
    return new Promise((_resolve, r) => {
      reject = r;
    });
  });
  const pending = cancelJntAwb(order.id, staff, "Data salah").catch((e) => e);
  await started;
  carrier.track.mockResolvedValue({
    awb: "TEST12345678",
    events: [{ ...cancellationEvent, code: "100", status: "Dalam perjalanan" }],
  });
  await syncJntTracking(order.id);
  reject(new JntCancellationRejected());
  expect(await pending).toMatchObject({ status: 409 });
  const current = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { shipment: true, jntShipmentRequest: true },
  });
  expect(current.status).toBe("SHIPPED");
  expect(current.shipment?.status).toBe("IN_TRANSIT");
  expect(current.shipment?.cancelledAt).toBeNull();
  expect(current.jntShipmentRequest).toMatchObject({
    state: "SUCCEEDED",
    errorCode: "CANCELLATION_REJECTED",
  });
});
it("does not apply stale cancellation over newer carrier movement or revive a delivered parcel", async () => {
  const order = await fixture();
  await prisma.shipment.update({
    where: { orderId: order.id },
    data: {
      status: "IN_TRANSIT",
      carrierEventAt: new Date("2026-01-03T03:00:00Z"),
    },
  });
  carrier.track.mockResolvedValue({
    awb: "TEST12345678",
    events: [cancellationEvent],
  });
  await syncJntTracking(order.id);
  expect(
    (
      await prisma.jntShipmentRequest.findUniqueOrThrow({
        where: { orderId: order.id },
      })
    ).state,
  ).toBe("SUCCEEDED");
  expect(
    (await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } }))
      .cancelledAt,
  ).toBeNull();
  carrier.track.mockResolvedValue({
    awb: "TEST12345678",
    events: [
      cancellationEvent,
      {
        ...cancellationEvent,
        code: "100",
        status: "Dalam perjalanan",
        time: "2026-01-03 10:00:00",
      },
    ],
  });
  await syncJntTracking(order.id);
  expect(
    (
      await prisma.jntShipmentRequest.findUniqueOrThrow({
        where: { orderId: order.id },
      })
    ).state,
  ).toBe("SUCCEEDED");
});

it("create timeout remains durable and only official-evidence reconciliation records the existing AWB", async () => {
  const o = await fixture();
  await cancelJntAwb(o.id, staff, "Data salah");
  carrier.create.mockRejectedValueOnce(new Error("mock timeout"));
  await expect(createJntAwb(o.id, staff)).rejects.toMatchObject({
    status: 409,
  });
  let r = await prisma.jntShipmentRequest.findUniqueOrThrow({
    where: { orderId: o.id },
  });
  expect(r.state).toBe("UNKNOWN");
  await expect(createJntAwb(o.id, staff)).rejects.toMatchObject({
    status: 409,
  });
  expect(carrier.create).toHaveBeenCalledTimes(1);
  const input = {
    externalOrderId: r.externalOrderId,
    awb: "TESTRECOVER123",
    evidenceReference: "MOCK-CASE-CREATE-123",
    attested: true,
  };
  await expect(reconcileJntCreation(o.id, staff, input)).rejects.toMatchObject({
    status: 409,
  });
  await prisma.jntShipmentRequest.update({
    where: { orderId: o.id },
    data: { updatedAt: new Date(Date.now() - 360000) },
  });
  await expect(
    reconcileJntCreation(o.id, staff, { ...input, externalOrderId: "OTHER" }),
  ).rejects.toMatchObject({ status: 409 });
  await reconcileJntCreation(o.id, staff, input);
  expect(await reconcileJntCreation(o.id, staff, input)).toMatchObject({
    replayed: true,
  });
  expect(
    await prisma.shipment.findUnique({ where: { orderId: o.id } }),
  ).toMatchObject({ trackingNumber: input.awb, status: "PENDING" });
  expect(
    (await prisma.order.findUniqueOrThrow({ where: { id: o.id } }))
      .paymentStatus,
  ).toBe("PAID");
  expect(carrier.create).toHaveBeenCalledTimes(1);
  expect(
    await prisma.auditLog.count({
      where: { entityId: o.id, action: "jnt.creation.reconciled" },
    }),
  ).toBe(1);
});
