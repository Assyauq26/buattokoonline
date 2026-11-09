import assert from "node:assert/strict";
import { resolve } from "node:path";
export async function verify({
  db,
  origin,
  admin,
  customer,
  foreign,
  page,
  buyerPage,
  shipping,
  checks,
  out,
  run,
}) {
  await db.shipment.update({
    where: { orderId: shipping.id },
    data: { sellerHandoverAt: new Date() },
  });
  const req = await db.jntShipmentRequest.findUniqueOrThrow({
    where: { orderId: shipping.id },
  });
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + `/admin/orders/${shipping.id}`);
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.getByText(req.externalOrderId, { exact: true }).waitFor();
    const cancel = page.getByRole("button", {
      name: "Batalkan resi J&T",
      exact: true,
    });
    await cancel.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByLabel("Alasan wajib").selectOption("Pesanan dibatalkan");
    assert.equal(
      await dialog
        .getByRole("button", { name: "Batalkan resi", exact: true })
        .isEnabled(),
      true,
    );
    await page.screenshot({ path: resolve(out, `jnt-cancel-${width}.png`) });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await cancel.evaluate((e) => e === document.activeElement),
      true,
    );
    checks.push(
      `JNT cancel ${width}: visible after seller statement, correct external ID, reason dialog and Escape; no dispatch`,
    );
  }
  // Terminal-state UI fixture; transaction/refund/stock behavior is exercised by DB provider-mock tests.
  await db.order.update({
    where: { id: shipping.id },
    data: {
      status: "CANCELLED",
      paymentStatus: "REFUNDED",
      payment: { update: { status: "REFUNDED" } },
      shipment: { update: { cancelledAt: new Date() } },
      jntShipmentRequest: { update: { state: "CANCELLED" } },
    },
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await buyerPage.setViewportSize({ width, height: 900 });
    await page.goto(origin + `/admin/orders/${shipping.id}`);
    await page.waitForLoadState("networkidle");
    await page
      .getByText(
        "Pesanan dibatalkan dan dana telah dikembalikan. Tidak ada pengiriman yang perlu disiapkan.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "Siapkan pengiriman", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Buat resi baru", exact: true })
        .count(),
      0,
    );
    await page.screenshot({
      path: resolve(out, `jnt-cancelled-refunded-${width}.png`),
    });
    await buyerPage.goto(origin + `/orders/${shipping.id}`);
    await buyerPage.waitForLoadState("networkidle");
    await buyerPage.getByText("Dibatalkan", { exact: true }).waitFor();
    assert.equal(
      await buyerPage
        .getByText(/Toko sedang menyiapkan pengiriman berikutnya/)
        .count(),
      0,
    );
    checks.push(
      `Cancelled/full-refund seller and owner ${width}: no shipping CTA or replacement promise`,
    );
  }
  await buyerPage.goto(
    origin +
      `/orders?tab=cancelled&q=${encodeURIComponent(shipping.orderNumber)}`,
  );
  await buyerPage.getByTestId("order-row-" + shipping.orderNumber).waitFor();
  const endpoint = origin + `/api/v1/admin/orders/${shipping.id}/jnt`;
  assert.equal(
    (
      await customer.request.post(endpoint, {
        headers: { Origin: origin },
        data: {
          action: "cancel",
          reason: "Data salah",
          expectedExternalOrderId: req.externalOrderId,
        },
      })
    ).status(),
    403,
  );
  assert.equal(
    (
      await admin.request.post(endpoint, {
        headers: { Origin: "https://untrusted.example" },
        data: {
          action: "cancel",
          reason: "Data salah",
          expectedExternalOrderId: req.externalOrderId,
        },
      })
    ).status(),
    403,
  );
  assert.equal(
    (
      await admin.request.post(endpoint, {
        headers: { Origin: origin },
        data: {
          action: "cancel",
          reason: "Data salah",
          expectedExternalOrderId: req.externalOrderId,
          externalOrderId: "FORGED",
        },
      })
    ).status(),
    422,
  );
  assert.equal(
    (
      await foreign.request.get(origin + `/api/v1/orders/${shipping.id}`)
    ).status(),
    404,
  );
  const foreignPage = await foreign.request.get(
    origin + `/orders/${shipping.id}`,
  );
  assert.equal(
    (await foreignPage.text()).includes(shipping.orderNumber),
    false,
    "Streamed not-found page must not disclose the other customer's order",
  );
  checks.push(
    "Cancelled tab, customer/cross-origin/foreign access denied; carrier order ID cannot be overridden",
  );
  // Keep shared harness cancellation-dialog check on a separate active fixture.
  await db.order.update({
    where: { id: shipping.id },
    data: {
      status: "PACKED",
      paymentStatus: "PAID",
      payment: { update: { status: "PAID" } },
      shipment: { update: { cancelledAt: null } },
      jntShipmentRequest: { update: { state: "SUCCEEDED" } },
    },
  });
}
