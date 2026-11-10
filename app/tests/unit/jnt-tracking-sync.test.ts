import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  inTransaction: false,
  track: vi.fn(),
  refund: vi.fn(),
  tx: {
    order: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn() },
    shipment: { update: vi.fn(), updateMany: vi.fn() },
    shipmentEvent: { findFirst: vi.fn(), create: vi.fn() },
    orderStatusHistory: { create: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: mocks.tx.order,
    shipment: mocks.tx.shipment,
    $transaction: async (fn: Function) => {
      mocks.inTransaction = true;
      try {
        return await fn(mocks.tx);
      } finally {
        mocks.inTransaction = false;
      }
    },
  },
}));
vi.mock("@/modules/orders/transaction-locks", () => ({ lockOrder: vi.fn() }));
vi.mock("@/modules/payments/refund-state", () => ({
  assertNoActiveRefund: mocks.refund,
}));
vi.mock("@/modules/shipping/shipping-settings.service", () => ({
  historicJntConfig: vi.fn().mockResolvedValue({ config: {} }),
}));
vi.mock("@/modules/audit/audit.service", () => ({ writeAudit: vi.fn() }));
vi.mock("@/infrastructure/shipping/jnt/official-transport", () => ({
  trackJntOrder: mocks.track,
}));
import { syncJntTracking } from "@/modules/shipping/jnt-tracking.service";
import { trackingOutcome } from "@/modules/shipping/jnt-tracking-policy";
import { HttpError } from "@/lib/response";
const event = (code: string, time = "2026-01-01 10:00:00") => ({
  code,
  time,
  status: "Paket telah diterima",
  note: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.refund.mockResolvedValue(undefined);
  mocks.tx.shipmentEvent.findFirst.mockResolvedValue(null);
  mocks.tx.order.findUniqueOrThrow.mockResolvedValue({
    id: "order",
    status: "SHIPPED",
    paymentStatus: "PAID",
    payment: { id: "pay", status: "PAID" },
    shipment: {
      id: "ship",
      provider: "jnt",
      status: "SHIPPED",
      trackingNumber: "JO12345678",
      updatedAt: new Date(0),
    },
    jntShipmentRequest: {
      state: "SUCCEEDED",
      awb: "JO12345678",
      externalOrderId: "EXT",
    },
  });
  mocks.track.mockResolvedValue({ awb: "JO12345678", events: [event("200")] });
});
describe("authoritative J&T tracking", () => {
  it("distinguishes depot receipt, manifest, cancellation and return from delivered", () => {
    for (const code of ["101", "150", "162", "163", "401", "402"])
      expect(trackingOutcome([event(code)])).toBeNull();
    expect(trackingOutcome([event("100")])).toBe("IN_TRANSIT");
    expect(trackingOutcome([event("200")])).toBe("DELIVERED");
    expect(trackingOutcome([event("200", "bad")])).toBeNull();
    expect(
      trackingOutcome([event("200"), event("401", "2026-01-02 10:00:00")]),
    ).toBeNull();
  });
  it("records verified delivery in shipment, order history and persisted tracking", async () => {
    await syncJntTracking("order");
    expect(mocks.tx.order.update).toHaveBeenCalledWith({
      where: { id: "order" },
      data: { status: "DELIVERED" },
    });
    expect(mocks.tx.shipmentEvent.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.orderStatusHistory.create).toHaveBeenCalledTimes(2);
    expect(mocks.tx.order.update).toHaveBeenCalledWith({
      where: { id: "order" },
      data: { status: "COMPLETED" },
    });
  });
  it("preserves order status on carrier failure and stamps the attempt for daily scheduling", async () => {
    mocks.track.mockRejectedValue(new Error("private response"));
    expect(await syncJntTracking("order")).toMatchObject({ failed: true });
    expect(mocks.tx.order.update).not.toHaveBeenCalled();
    expect(
      mocks.tx.shipment.updateMany.mock.calls[0][0].data.notes,
    ).not.toContain("private");
  });
  it("records carrier delivery during financial holds without completing the order or closing cases", async () => {
    mocks.refund.mockRejectedValue(new HttpError("hold", 409));
    await syncJntTracking("order");
    expect(mocks.tx.order.update).toHaveBeenCalledWith({
      where: { id: "order" },
      data: { status: "DELIVERED" },
    });
    expect(mocks.refund).toHaveBeenCalled();
    expect(
      mocks.tx.order.update.mock.calls.map(([x]) => x.data.status),
    ).not.toContain("COMPLETED");
  });
  it("records physical delivery after a full refund without reviving cancelled orders", async () => {
    const order = await mocks.tx.order.findUniqueOrThrow();
    order.paymentStatus = "REFUNDED";
    order.payment.status = "REFUNDED";
    await syncJntTracking("order");
    expect(mocks.tx.order.update).toHaveBeenCalledWith({
      where: { id: "order" },
      data: { status: "DELIVERED" },
    });
    mocks.tx.order.update.mockClear();
    order.status = "CANCELLED";
    await syncJntTracking("order");
    expect(mocks.tx.order.update).not.toHaveBeenCalled();
  });
  it("skips daily requests already checked within 24 hours", async () => {
    const order = await mocks.tx.order.findUniqueOrThrow();
    order.shipment.updatedAt = new Date();
    mocks.tx.order.findUniqueOrThrow.mockResolvedValue(order);
    expect(await syncJntTracking("order", true)).toMatchObject({
      skipped: true,
    });
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it("avoids duplicate tracking events", async () => {
    mocks.tx.shipmentEvent.findFirst.mockResolvedValue({ id: "existing" });
    await syncJntTracking("order");
    expect(mocks.tx.shipmentEvent.create).not.toHaveBeenCalled();
  });
});

it("never applies a late result to a replaced shipment", async () => {
  const original = await mocks.tx.order.findUniqueOrThrow();
  mocks.tx.order.findUniqueOrThrow
    .mockResolvedValueOnce(original)
    .mockResolvedValueOnce({
      ...original,
      shipment: { ...original.shipment, id: "replacement" },
    });
  expect(await syncJntTracking("order")).toMatchObject({ skipped: true });
  expect(mocks.tx.order.update).not.toHaveBeenCalled();
  expect(mocks.tx.shipmentEvent.create).not.toHaveBeenCalled();
});
it("does not regress delivered status or carrier watermark on out of order events", async () => {
  const o = await mocks.tx.order.findUniqueOrThrow();
  o.status = "DELIVERED";
  o.shipment.status = "DELIVERED";
  o.shipment.carrierEventAt = new Date("2026-01-03T00:00:00Z");
  mocks.tx.order.findUniqueOrThrow.mockResolvedValue(o);
  mocks.track.mockResolvedValue({ events: [event("100")] });
  await syncJntTracking("order");
  expect(mocks.tx.shipment.update.mock.calls[0][0].data.status).toBe(
    "DELIVERED",
  );
  expect(mocks.tx.shipment.update.mock.calls[0][0].data).not.toHaveProperty(
    "carrierEventAt",
  );
  expect(mocks.tx.order.update).not.toHaveBeenCalled();
});
it("does not hold a database transaction open across provider network I/O", async () => {
  let started = false;
  const original = mocks.tx.order.findUniqueOrThrow.getMockImplementation();
  mocks.track.mockImplementation(async () => {
    expect(started).toBe(false);
    expect(mocks.inTransaction).toBe(false);
    return { events: [event("200")] };
  });
  mocks.tx.shipment.update.mockImplementation(async () => {
    started = true;
  });
  await syncJntTracking("order");
  expect(started).toBe(true);
});

it.each(["PAID", "PROCESSING"])(
  "reconciles a legacy %s order from authenticated pickup without inventing a packing timestamp",
  async (status) => {
    const o = await mocks.tx.order.findUniqueOrThrow();
    o.status = status;
    o.shipment.status = "PENDING";
    mocks.track.mockResolvedValue({
      awb: "JO12345678",
      events: [event("100")],
    });
    await syncJntTracking("order");
    expect(mocks.tx.order.update).toHaveBeenCalledWith({
      where: { id: "order" },
      data: { status: "SHIPPED" },
    });
    expect(
      mocks.tx.orderStatusHistory.create.mock.calls.some(
        ([v]) => v.data.toStatus === "PACKED",
      ),
    ).toBe(false);
  },
);
it.each(["RETURNING", "RETURNED"])(
  "never erases %s on a subsequent ordinary station scan",
  async (condition) => {
    const o = await mocks.tx.order.findUniqueOrThrow();
    o.status = "COMPLETED";
    o.shipment.status = "DELIVERED";
    o.shipment.carrierCondition = condition;
    o.shipment.carrierEventAt = new Date("2026-01-01T00:00:00Z");
    mocks.track.mockResolvedValue({
      awb: "JO12345678",
      events: [event("100", "2026-01-02 10:00:00")],
    });
    await syncJntTracking("order");
    expect(
      mocks.tx.shipment.update.mock.calls[0][0].data.carrierCondition,
    ).toBe(condition);
    expect(mocks.tx.order.update).not.toHaveBeenCalled();
  },
);
