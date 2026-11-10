import { expect, it } from "vitest";
import { orderFlow, summarizeProducts } from "@/modules/orders/flow-state";
const paid = { status: "PAID", paymentStatus: "PAID" };
it.each([
  [
    { status: "PENDING_PAYMENT", paymentStatus: "PENDING_PAYMENT" },
    "Menunggu pembayaran",
    "detail",
  ],
  [
    { status: "PENDING_PAYMENT", paymentStatus: "WAITING_VERIFICATION" },
    "Menunggu verifikasi",
    "verify",
  ],
  [
    { status: "PENDING_PAYMENT", paymentStatus: "REJECTED" },
    "Perlu perbaikan pembayaran",
    "detail",
  ],
  [paid, "Pembayaran disetujui", "prepare"],
  [{ ...paid, status: "PROCESSING" }, "Sedang dikemas", "create"],
  [{ ...paid, status: "PACKED" }, "Sedang dikemas", "create"],
  [
    {
      ...paid,
      status: "PACKED",
      jntShipmentRequest: { state: "SUCCEEDED", awb: "TEST1234" },
      shipment: { status: "PENDING" },
    },
    "Menunggu pickup",
    "print",
  ],
  [{ ...paid, status: "SHIPPED" }, "Dikirim", "track"],
  [{ ...paid, status: "DELIVERED" }, "Selesai", "history"],
  [{ ...paid, status: "COMPLETED" }, "Selesai", "history"],
  [{ ...paid, status: "CANCELLED" }, "Dibatalkan", "detail"],
  [
    {
      ...paid,
      status: "COMPLETED",
      shipment: { carrierCondition: "RETURNING" },
      jntShipmentRequest: { awb: "TEST1234" },
    },
    "Retur",
    "track",
  ],
])(
  "selects the primary status and single action for %j",
  (o, label, action) => {
    expect(orderFlow(o)).toMatchObject({ label, action });
  },
);
it("keeps uncertain operations separate from successful business states and holds fulfillment", () => {
  const o = {
    ...paid,
    status: "PACKED",
    jntShipmentRequest: { state: "UNKNOWN", errorCode: "UNCONFIRMED" },
  };
  expect(orderFlow(o)).toMatchObject({
    key: "packing",
    action: "detail",
    operation: "Memeriksa hasil pembuatan resi",
  });
  expect(
    orderFlow({ ...o, jntShipmentRequest: { state: "CANCELLED" } }),
  ).toMatchObject({ key: "packing", action: "create", cta: "Buat resi baru" });
  expect(
    orderFlow({ ...o, shipment: { carrierCondition: "ISSUE" } }).key,
  ).not.toBe("return");
});
it("does not invent a refund obligation for rejected or unapproved cases", () => {
  for (const state of [
    "REVIEW",
    "WAITING_RETURN",
    "REJECTED",
    "CANCELLED_NO_REFUND",
    "RECEIVED",
  ])
    expect(
      orderFlow({ ...paid, resolutions: [{ state, refundAmount: 36000 }] })
        .financial,
    ).toBe("");
  expect(
    orderFlow({
      ...paid,
      status: "CANCELLED",
      resolutions: [{ state: "READY", refundAmount: 36000 }],
    }).financial,
  ).toBe("Refund perlu diproses");
});
it("counts distinct products, units and hidden thumbnails accurately across variants", () => {
  const i = (productId: string, quantity = 1) => ({
    productName: productId,
    variant: { productId },
    quantity,
  });
  const a = summarizeProducts([i("A", 2), i("A", 3), i("B"), i("C"), i("D")]);
  expect(a).toMatchObject({ count: 4, units: 8, remaining: 2 });
  expect(a.previews).toHaveLength(2);
  const b = summarizeProducts([i("A", 2), i("A", 3)]);
  expect(b).toMatchObject({ count: 1, units: 5, name: "A", remaining: 0 });
  expect(summarizeProducts([])).toMatchObject({
    count: 0,
    units: 0,
    remaining: 0,
  });
});
