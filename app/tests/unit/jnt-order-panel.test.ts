// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/admin/awb-print-button", () => ({
  AwbPrintButton: () => null,
}));
vi.mock("@/components/admin/operation-form", () => ({
  OperationForm: () => null,
}));
import { JntOrderPanel } from "@/components/admin/jnt-order-panel";
const props = {
  orderId: "internal-order",
  isOfficial: true,
  service: "EZ",
  status: "PACKED",
  hasPaid: true,
  canCreate: true,
  canUpdate: true,
  canRead: true,
  requestState: "SUCCEEDED",
  awb: "JO12345678",
  shipmentStatus: "PENDING",
  externalOrderId: "SO-TEST-001",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps cancellation visible after seller handover and pins the displayed carrier identity against stale tabs", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { cancelled: true } }),
        { status: 200 },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  render(
    React.createElement(JntOrderPanel, { ...props, sellerHandoverAt: true }),
  );
  expect(screen.getByText("SO-TEST-001")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Batalkan resi J&T" }));
  fireEvent.change(screen.getByLabelText("Alasan wajib"), {
    target: { value: "Pesanan dibatalkan" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Batalkan resi" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[0][0]).toBe(
    "/api/v1/admin/orders/internal-order/jnt",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    action: "cancel",
    reason: "Pesanan dibatalkan",
    expectedExternalOrderId: "SO-TEST-001",
  });
});
it("explains unavailable cancellation after confirmed carrier pickup", () => {
  render(
    React.createElement(JntOrderPanel, {
      ...props,
      shipmentStatus: "IN_TRANSIT",
      status: "SHIPPED",
    }),
  );
  expect(
    screen.queryByRole("button", { name: "Batalkan resi J&T" }),
  ).toBeNull();
  expect(screen.getByText(/Pembatalan resi tidak tersedia/)).toBeVisible();
});
it("keeps tracking reconciliation accessible after an uncertain cancellation", () => {
  render(
    React.createElement(JntOrderPanel, {
      ...props,
      requestState: "UNKNOWN",
      errorCode: "CANCELLATION_PENDING",
    }),
  );
  expect(
    screen.getByRole("button", { name: "Perbarui tracking" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Batalkan resi J&T" }),
  ).toBeNull();
});
