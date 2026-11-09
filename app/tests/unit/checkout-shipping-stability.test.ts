// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
vi.mock("react-dom", async (original) => ({
  ...(await original<object>()),
  useFormState: () => [{ ok: false }, () => {}],
  useFormStatus: () => ({ pending: false }),
}));
vi.mock("@/modules/checkout/checkout.actions", () => ({
  createOrderAction: vi.fn(),
}));
vi.mock("@/components/storefront/region-selector-dialog", () => ({
  RegionSelectorDialog: ({ onChange, value }: any) =>
    React.createElement(
      "button",
      {
        type: "button",
        onClick: () =>
          onChange({
            ...value,
            districtCode: "33.25.02",
            villageCode: "33.25.02.0001",
          }),
      },
      "Ganti lokasi",
    ),
}));
import { CheckoutClient } from "@/components/storefront/checkout-client";
const address = {
  recipientName: "Buyer",
  phone: "081234567890",
  line: "Jalan Uji 1",
  province: "Jawa Tengah",
  city: "Batang",
  district: "Warungasem",
  village: "Banjaran",
  provinceCode: "33",
  cityCode: "33.25",
  districtCode: "33.25.01",
  villageCode: "33.25.01.0001",
  postalCode: "51252",
};
const props = {
  subtotal: 10000,
  expectedLines: [],
  requestId: "test",
  banks: [
    {
      id: "bank",
      displayName: "Bank",
      bankName: "Bank",
      accountNumber: "123456",
      accountHolder: "Store",
    },
  ],
  address,
};
function result(body: any, cost = 7000) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        subtotal: 10000,
        shippingCost: body.shipping ? cost : 0,
        discount: 0,
        total: 10000 + (body.shipping ? cost : 0),
        shippingValid: !!body.shipping,
        quoteExpiresAt: Date.now() + 60000,
        shippingRates: [
          {
            courier: "jnt",
            service: "EZ",
            cost,
            quoteToken: "signed-token",
            expiresAt: Date.now() + 60000,
            mode: "official",
          },
        ],
      },
    }),
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("retains visible services and selection while totals recalculate, without duplicate reference-only requests", async () => {
  let finish!: (v: unknown) => void;
  const fetch = vi.fn(async (_u: any, options: any) => {
    const body = JSON.parse(options.body);
    return body.shipping
      ? new Promise((r) => {
          finish = r;
        })
      : result(body);
  });
  vi.stubGlobal("fetch", fetch);
  const view = render(React.createElement(CheckoutClient, props as any));
  const choice = await screen.findByTestId("ship-option-0");
  fireEvent.click(choice.querySelector("input")!);
  await screen.findByText("Memperbarui total…");
  expect(choice).toBeVisible();
  expect(choice.querySelector("input")).toBeChecked();
  expect(screen.getByTestId("place-order-btn")).toBeDisabled();
  view.rerender(
    React.createElement(CheckoutClient, { ...props, expectedLines: [] } as any),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await act(async () => finish(result({ shipping: true })));
  await waitFor(() =>
    expect(screen.getByTestId("place-order-btn")).toBeEnabled(),
  );
  expect(screen.getByTestId("checkout-total")).toHaveTextContent("17.000");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("invalidates old rates for a changed destination and ignores a reversed stale response", async () => {
  let old!: (v: unknown) => void, newest!: (v: unknown) => void;
  const fetch = vi.fn(async (_u: any, o: any) => {
    const b = JSON.parse(o.body);
    if (b.address.districtCode === "33.25.02")
      return new Promise((r) => {
        newest = r;
      });
    if (b.shipping)
      return new Promise((r) => {
        old = r;
      });
    return result(b);
  });
  vi.stubGlobal("fetch", fetch);
  render(React.createElement(CheckoutClient, props as any));
  fireEvent.click(
    (await screen.findByTestId("ship-option-0")).querySelector("input")!,
  );
  await waitFor(() => expect(old).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Ganti lokasi" }));
  await waitFor(() => expect(newest).toBeTruthy());
  expect(screen.getByTestId("place-order-btn")).toBeDisabled();
  expect(
    screen.getByTestId("ship-option-0").querySelector("input"),
  ).toBeDisabled();
  await act(async () => old(result({ shipping: true }, 7000)));
  expect(screen.getByTestId("place-order-btn")).toBeDisabled();
  await act(async () => newest(result({}, 9000)));
  await screen.findByText(
    "Tarif layanan berubah. Pilih layanan untuk menyetujui ongkir terbaru.",
  );
  expect(screen.getByTestId("ship-option-0")).toHaveTextContent("9.000");
  expect(screen.getByTestId("place-order-btn")).toBeDisabled();
});
it("leaves a retryable error rather than an empty shipping box", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Jaringan ongkir terputus")),
  );
  render(React.createElement(CheckoutClient, props as any));
  expect(
    await screen.findByRole("button", { name: "Coba lagi" }),
  ).toBeEnabled();
  expect(screen.getByTestId("place-order-btn")).toBeDisabled();
});
