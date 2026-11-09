import { describe, it, expect } from "vitest";
import {
  canRequestJntCancellation,
  shipmentHasLeftWarehouse,
} from "@/modules/shipping/jnt-cancellation-policy";
import { trackingCancellation } from "@/modules/shipping/jnt-tracking-policy";
const cancelled = {
  code: "162",
  status: "Cancelled AWB by Seller",
  time: "2026-01-02 10:00:00",
  note: null,
};
describe("carrier cancellation truth", () => {
  it("allows pending AWBs after seller statement but denies confirmed movement and uncertain dispatch", () => {
    expect(
      canRequestJntCancellation({
        orderStatus: "PACKED",
        requestState: "SUCCEEDED",
        shipmentStatus: "PENDING",
      }),
    ).toBe(true);
    for (const shipmentStatus of ["SHIPPED", "IN_TRANSIT", "DELIVERED"])
      expect(
        canRequestJntCancellation({
          orderStatus: "PACKED",
          requestState: "SUCCEEDED",
          shipmentStatus,
        }),
      ).toBe(false);
    expect(
      canRequestJntCancellation({
        orderStatus: "PACKED",
        requestState: "UNKNOWN",
        shipmentStatus: "PENDING",
      }),
    ).toBe(false);
  });
  it("requires code, exact cancellation status, valid time and no contradictory latest event", () => {
    expect(trackingCancellation([cancelled])).toEqual(
      new Date("2026-01-02T03:00:00Z"),
    );
    expect(trackingCancellation([{ ...cancelled, code: "101" }])).toBeNull();
    expect(
      trackingCancellation([{ ...cancelled, status: "Paket telah diterima" }]),
    ).toBeNull();
    expect(trackingCancellation([{ ...cancelled, time: "bad" }])).toBeNull();
    expect(
      trackingCancellation([cancelled, { ...cancelled, code: "100" }]),
    ).toBeNull();
    expect(
      trackingCancellation([
        cancelled,
        { ...cancelled, code: "100", time: "2026-01-03 10:00:00" },
      ]),
    ).toBeNull();
  });
  it("keeps handover history while recognizing confirmed cancellation before carrier pickup", () => {
    const shipment = {
      provider: "jnt",
      status: "PENDING",
      sellerHandoverAt: new Date(),
      cancelledAt: new Date(),
      events: [],
    };
    expect(
      shipmentHasLeftWarehouse({
        orderStatus: "PACKED",
        requestState: "CANCELLED",
        shipment,
      }),
    ).toBe(false);
    expect(
      shipmentHasLeftWarehouse({
        orderStatus: "PACKED",
        requestState: "SUCCEEDED",
        shipment: { ...shipment, cancelledAt: null },
      }),
    ).toBe(true);
    expect(
      shipmentHasLeftWarehouse({
        orderStatus: "PACKED",
        requestState: "CANCELLED",
        shipment: { ...shipment, events: [{ status: "IN_TRANSIT" }] },
      }),
    ).toBe(true);
  });
});
