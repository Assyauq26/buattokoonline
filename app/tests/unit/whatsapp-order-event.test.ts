import { it, expect } from "vitest";
import { whatsappOrderEvent } from "@/modules/whatsapp/order-event";
it("AWB is waiting pickup, confirmed tracking is shipped, refund record is not received", () => {
  const o = {
    status: "PROCESSING",
    paymentStatus: "PAID",
    jntShipmentRequest: { state: "SUCCEEDED", awb: "SYNTHETIC" },
  };
  expect(whatsappOrderEvent(o)).toBe("awb_created");
  expect(whatsappOrderEvent({ ...o, shipment: { status: "IN_TRANSIT" } })).toBe(
    "shipped",
  );
  expect(whatsappOrderEvent({ ...o, shipment: { status: "DELIVERED" } })).toBe(
    "delivered",
  );
  expect(whatsappOrderEvent({ ...o, status: "CANCELLED" })).toBe("cancelled");
  expect(
    whatsappOrderEvent({
      ...o,
      status: "CANCELLED",
      resolutions: [{ state: "TRANSFER_RECORDED", refundAmount: 36000 }],
    }),
  ).toBe("refund_recorded");
  expect(
    whatsappOrderEvent({ ...o, shipment: { carrierCondition: "RETURNING" } }),
  ).toBe("returned");
});
