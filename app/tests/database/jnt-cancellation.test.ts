import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const carrier = vi.hoisted(() => ({ cancel: vi.fn(), create: vi.fn() }));
vi.mock("@/infrastructure/shipping/jnt/official-transport", async original => ({ ...await original<object>(), cancelJntOrder: carrier.cancel, createJntOrder: carrier.create }));
vi.mock("@/modules/shipping/shipping-settings.service", () => ({ historicJntConfig: async () => ({ environment: "sandbox", mappingVersion: "test", config: { seller: { warehouse: { name: "Test Store", contact: "Test", address: "Jalan Contoh 1", phone: "081234567890", originCityCode: "BGG" } } } }) }));
vi.mock("@/infrastructure/shipping/jnt/verified-mapping", () => ({ getVerifiedJntDistrict: async () => ({ destinationCityCode: "BGG", receiverArea: "BGG001" }) }));
import { prisma } from "@/lib/prisma";
import { cancelJntAwb, createJntAwb, handoverJntPackage, reconcileJntCancellation } from "@/modules/shipping/jnt-fulfillment.service";
import { PERMISSIONS } from "@/lib/auth/permissions";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/management_v130_test") throw new Error("Requires isolated local management_v130_test database");
let staff: string;
beforeAll(async () => {
  process.env.JNT_API_ENV = "sandbox"; process.env.JNT_ENABLE_CANCELLATION = "yes"; process.env.JNT_ENABLE_ORDER_CREATE = "yes";
  const role = await prisma.role.upsert({ where: { name: "Admin" }, update: {}, create: { name: "Admin", label: "Test" } });
  for (const key of [PERMISSIONS.SHIPPING_CREATE, PERMISSIONS.SHIPPING_UPDATE]) {
    const permission = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, label: key } });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  }
  staff = (await prisma.user.create({ data: { name: "Mock carrier operator", email: `${randomUUID()}@example.test`, passwordHash: "disabled-test-login", roles: { create: { roleId: role.id } } } })).id;
});
beforeEach(() => { vi.clearAllMocks(); carrier.cancel.mockResolvedValue({ cancelled: true }); carrier.create.mockImplementation(async values => ({ orderId: values.orderid, awb: "TEST" + randomUUID().replaceAll("-", "").slice(0, 15).toUpperCase(), routingCode: null })); });
afterAll(async () => prisma.$disconnect());
async function fixture() {
  const variant = await prisma.productVariant.create({ data: { sku: randomUUID(), product: { create: { name: "Synthetic", slug: randomUUID(), basePrice: 10000 } } } });
  return prisma.order.create({ data: {
    userId: staff, orderNumber: randomUUID(), status: "PACKED", paymentStatus: "PAID", subtotal: 10000, total: 10000,
    shippingCourier: "J&T Express", shippingMode: "official", shippingService: "EZ", shippingWeightGram: 400,
    payment: { create: { amount: 10000, status: "PAID" } },
    items: { create: { variantId: variant.id, productName: "Synthetic", variantLabel: "One", quantity: 1, unitPrice: 10000, lineTotal: 10000 } },
    address: { create: { recipientName: "Test", phone: "081234567890", line: "Jalan Contoh 1", province: "Aceh", city: "Kabupaten", district: "Kecamatan", provinceCode: "11", cityCode: "1101", districtCode: "1101010", postalCode: "" } },
    shipment: { create: { provider: "jnt", courier: "J&T Express", status: "PENDING", trackingNumber: "TEST12345678" } },
    jntShipmentRequest: { create: { externalOrderId: randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase(), payloadFingerprint: "a".repeat(64), state: "SUCCEEDED", awb: "TEST12345678", requestedBy: staff } },
  }, include: { payment: true, jntShipmentRequest: true } });
}
it("cancels once concurrently, preserves paid active order, and blocks handover", async () => {
  const order = await fixture();
  const results = await Promise.allSettled([cancelJntAwb(order.id, staff), cancelJntAwb(order.id, staff)]);
  expect(results.some(r => r.status === "fulfilled")).toBe(true); expect(carrier.cancel).toHaveBeenCalledTimes(1);
  expect(await cancelJntAwb(order.id, staff)).toMatchObject({ replayed: true });
  const current = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { shipment: true, payment: true } });
  expect(current.status).toBe("PACKED"); expect(current.payment?.status).toBe("PAID"); expect(current.shipment?.cancelledAt).not.toBeNull();
  await expect(handoverJntPackage(order.id, staff)).rejects.toMatchObject({ status: 409 });
});
it("rejects cancellation after physical pickup", async () => {
  const order = await fixture(); await prisma.order.update({ where: { id: order.id }, data: { status: "SHIPPED", shipment: { update: { status: "SHIPPED" } } } });
  await expect(cancelJntAwb(order.id, staff)).rejects.toMatchObject({ status: 409 }); expect(carrier.cancel).not.toHaveBeenCalled();
});
it("keeps failed and uncertain cancellation blocked until verified reconciliation", async () => {
  const order = await fixture(); carrier.cancel.mockRejectedValueOnce(new Error("mock transport timeout"));
  await expect(cancelJntAwb(order.id, staff)).rejects.toMatchObject({ status: 409 });
  await expect(cancelJntAwb(order.id, staff)).rejects.toMatchObject({ status: 409 });
  await expect(createJntAwb(order.id, staff)).rejects.toMatchObject({ status: 409 });
  expect(carrier.cancel).toHaveBeenCalledTimes(1); expect(carrier.create).not.toHaveBeenCalled();
  await expect(reconcileJntCancellation(order.id, staff, { attested: true, evidenceReference: "MOCK-CASE-123456" })).rejects.toMatchObject({ status: 409 });
  await prisma.jntShipmentRequest.update({ where: { orderId: order.id }, data: { updatedAt: new Date(Date.now() - 360000) } });
  await expect(reconcileJntCancellation(order.id, staff, { attested: false, evidenceReference: "MOCK-CASE-123456" })).rejects.toMatchObject({ status: 422 });
  expect(await reconcileJntCancellation(order.id, staff, { attested: true, evidenceReference: "MOCK-CASE-123456" })).toMatchObject({ cancelled: true });
  expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "jnt.cancel.reconciled" } })).toBe(1);
});
it("archives cancelled attempt before one concurrent reissue, uses a new external ID", async () => {
  const order = await fixture(); await cancelJntAwb(order.id, staff);
  const results = await Promise.allSettled([createJntAwb(order.id, staff), createJntAwb(order.id, staff)]);
  expect(results.some(r => r.status === "fulfilled")).toBe(true); expect(carrier.create).toHaveBeenCalledTimes(1);
  const history = await prisma.jntShipmentAttempt.findMany({ where: { orderId: order.id } });
  expect(history).toHaveLength(1); expect(history[0].externalOrderId).toBe(order.jntShipmentRequest?.externalOrderId); expect(history[0].awb).toBe("TEST12345678");
  const current = await prisma.jntShipmentRequest.findUniqueOrThrow({ where: { orderId: order.id } });
  expect(current.externalOrderId).not.toBe(history[0].externalOrderId); expect(current.state).toBe("SUCCEEDED");
});
it("does not issue or cancel while refund is active", async () => {
  const order = await fixture(); await prisma.paymentEvent.create({ data: { paymentId: order.payment!.id, type: "REFUND_REQUESTED", externalId: randomUUID(), payload: {} } });
  await expect(cancelJntAwb(order.id, staff)).rejects.toMatchObject({ status: 409 }); expect(carrier.cancel).not.toHaveBeenCalled();
});
