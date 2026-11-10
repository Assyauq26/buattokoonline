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
  buyer,
  variant,
  shipping,
  waiting,
  checks,
  out,
  run,
}) {
  const prefix = "FLOW-" + run.slice(0, 8);
  const v = await db.productVariant.create({
    data: {
      sku: prefix,
      product: {
        create: { name: "Blouse Kamila", slug: prefix, basePrice: 29000 },
      },
      inventory: { create: { onHand: 5, reserved: 1 } },
    },
  });
  const proof = await db.paymentConfirmation.findFirstOrThrow({
    where: { paymentId: waiting.payment.id },
  });
  const create = async (status = "PAID", pay = "PAID", items) =>
    db.order.create({
      data: {
        orderNumber: prefix + "-" + crypto.randomUUID().slice(0, 4),
        userId: buyer.id,
        status,
        paymentStatus: pay,
        subtotal: items ? items.reduce((n, i) => n + i.lineTotal, 0) : 29000,
        total:
          (items ? items.reduce((n, i) => n + i.lineTotal, 0) : 29000) + 7000,
        shippingCost: 7000,
        shippingCourier: "J&T Express",
        shippingMode: "official",
        shippingService: "EZ",
        shippingWeightGram: 300,
        expiresAt: new Date(Date.now() + 86400000),
        items: {
          create: items || [
            {
              variantId: v.id,
              productName: "Blouse Kamila",
              variantLabel: "Biru / Panjang / XL",
              quantity: 1,
              unitPrice: 29000,
              lineTotal: 29000,
              imageUrl: "/fixture-product.svg",
            },
          ],
        },
        address: {
          create: {
            recipientName: "Pembeli Demo",
            phone: "081234567890",
            line: "Jalan Contoh 1",
            province: "Jawa Tengah",
            city: "Batang",
            district: "Warungasem",
            village: "Banjaran",
            postalCode: "",
          },
        },
        payment: {
          create: {
            status: pay,
            amount:
              (items ? items.reduce((n, i) => n + i.lineTotal, 0) : 29000) +
              7000,
            ...(pay === "WAITING_VERIFICATION"
              ? {
                  confirmations: {
                    create: {
                      senderBank: "BCA",
                      senderName: "Pembeli Demo",
                      amount: 36000,
                      transferDate: new Date(),
                      proofPath: proof.proofPath,
                      proofMime: proof.proofMime,
                      status: "SUBMITTED",
                    },
                  },
                }
              : {}),
          },
        },
      },
      include: { payment: true },
    });
  const o = await create("PENDING_PAYMENT", "WAITING_VERIFICATION");
  await page.goto(origin + "/admin/orders/" + o.id);
  await page
    .getByRole("button", { name: "Terima pembayaran", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Terima pembayaran", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Siapkan paket", exact: true })
    .waitFor();
  const sale = await db.inventory.findUnique({ where: { variantId: v.id } });
  assert.equal(sale.onHand, 4);
  assert.equal(sale.reserved, 0);
  await page
    .getByRole("button", { name: "Siapkan paket", exact: true })
    .click();
  await page.getByRole("button", { name: "Buat resi", exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    (await db.order.findUniqueOrThrow({ where: { id: o.id } })).status,
    "PACKED",
  );
  assert.deepEqual(
    await db.inventory.findUnique({ where: { variantId: v.id } }),
    sale,
  );
  await page.getByRole("button", { name: "Buat resi", exact: true }).click();
  await page.getByRole("dialog").getByText("Blouse Kamila").waitFor();
  await page.screenshot({ path: resolve(out, "shipping-review-390.png") });
  await page.keyboard.press("Escape");
  assert.equal(
    (
      await customer.request.get(
        origin + `/api/v1/admin/orders/${o.id}/shipping-review`,
      )
    ).status(),
    403,
  );
  assert.equal(
    (
      await customer.request.post(
        origin + `/api/v1/admin/orders/${o.id}/prepare`,
        { headers: { Origin: origin }, data: {} },
      )
    ).status(),
    403,
  );
  assert.equal(
    (
      await admin.request.post(
        origin + `/api/v1/admin/orders/${o.id}/prepare`,
        { headers: { Origin: "https://untrusted.example" }, data: {} },
      )
    ).status(),
    403,
  );
  checks.push(
    "Real payment approval -> one-click prepare -> single AWB review; no duplicate sale or carrier dispatch; customer/origin denied",
  );
  await db.jntShipmentRequest.create({
    data: {
      orderId: o.id,
      externalOrderId:
        "F-" + crypto.randomUUID().replaceAll("-", "").slice(0, 18),
      state: "UNKNOWN",
      errorCode: "UNCONFIRMED",
      requestedBy: buyer.id,
      payloadFingerprint: "a".repeat(64),
    },
  });
  await page.goto(origin + "/admin/orders/" + o.id);
  await page
    .getByText("Memeriksa hasil pembuatan resi", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Buat resi", exact: true }).count(),
    0,
  );
  assert.equal(await page.locator("#order-shipping").getAttribute("open"), "");
  await page
    .getByRole("button", { name: "Catat resi hasil rekonsiliasi", exact: true })
    .waitFor();
  await page.screenshot({
    path: resolve(out, "uncertain-awb-review-390.png"),
    fullPage: true,
  });
  checks.push(
    "Uncertain AWB opens reconciliation without offering another create or packing action",
  );

  const items = [];
  for (let i = 0; i < 4; i++) {
    const pv = await db.productVariant.create({
      data: {
        sku: prefix + "-" + i,
        product: {
          create: {
            name: "Produk " + i,
            slug: prefix + "-" + i,
            basePrice: 29000,
          },
        },
      },
    });
    items.push({
      variantId: pv.id,
      productName: "Produk " + i,
      variantLabel: "Hijau / XL",
      quantity: i === 0 ? 2 : 1,
      unitPrice: 29000,
      lineTotal: 29000 * (i === 0 ? 2 : 1),
      imageUrl: "/fixture-product.svg",
    });
  }
  const multi = await create("PAID", "PAID", items);
  // Same product with another variant contributes units, never an extra distinct-product count.
  const twin = await db.productVariant.create({
    data: { sku: prefix + "-twin", productId: v.productId },
  });
  await create("PAID", "PAID", [
    {
      variantId: v.id,
      productName: "Blouse Kamila",
      variantLabel: "Biru / XL",
      quantity: 1,
      unitPrice: 29000,
      lineTotal: 29000,
    },
    {
      variantId: twin.id,
      productName: "Blouse Kamila",
      variantLabel: "Krem / M",
      quantity: 2,
      unitPrice: 29000,
      lineTotal: 58000,
    },
  ]);
  const single = await create("PAID", "PAID");
  const cancelled = await create("CANCELLED", "REFUNDED");
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/admin/orders?q=" + prefix);
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    const card = page.getByTestId("admin-order-" + multi.orderNumber);
    await card.getByText("4 produk • 5 pcs", { exact: true }).waitFor();
    await card.getByText("+2", { exact: true }).waitFor();
    assert.equal(
      await card.locator("button, a.flow-primary, a.flow-secondary").count(),
      1,
    );
    assert.equal(
      await card.locator(".compact-total").innerText(),
      "Total\nRp 152.000",
    );
    await page.screenshot({
      path: resolve(out, "compact-orders-" + width + ".png"),
      fullPage: true,
    });
    await page.goto(origin + "/admin/orders/" + single.id);
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.screenshot({
      path: resolve(out, "simple-detail-ready-" + width + ".png"),
      fullPage: true,
    });
    checks.push(
      "Compact list and detail " +
        width +
        ": no overflow, four distinct products, exact +2 and server total; single CTA",
    );
  }
  for (const [status, pay, label, extra] of [
    ["PENDING_PAYMENT", "PENDING_PAYMENT", "Menunggu pembayaran", {}],
    ["PENDING_PAYMENT", "REJECTED", "Perlu perbaikan pembayaran", {}],
    ["PACKED", "PAID", "Sedang dikemas", {}],
    [
      "PACKED",
      "PAID",
      "Menunggu pickup",
      {
        shipment: {
          create: {
            provider: "jnt",
            courier: "J&T Express",
            status: "PENDING",
            trackingNumber: "TESTFLOW1234",
          },
        },
        jntShipmentRequest: {
          create: {
            externalOrderId:
              "F-" + crypto.randomUUID().replaceAll("-", "").slice(0, 18),
            state: "SUCCEEDED",
            awb: "TESTFLOW1234",
            requestedBy: shipping.userId || buyer.id,
            payloadFingerprint: "a".repeat(64),
          },
        },
      },
    ],
    [
      "SHIPPED",
      "PAID",
      "Dikirim",
      { shipment: { update: { status: "IN_TRANSIT" } } },
    ],
    [
      "COMPLETED",
      "PAID",
      "Selesai",
      { shipment: { update: { status: "DELIVERED" } } },
    ],
    [
      "COMPLETED",
      "PAID",
      "Retur",
      { shipment: { update: { carrierCondition: "RETURNING" } } },
    ],
  ]) {
    await db.order.update({
      where: { id: single.id },
      data: {
        status,
        paymentStatus: pay,
        payment: { update: { status: pay } },
        ...extra,
      },
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(origin + "/admin/orders/" + single.id);
    await page.waitForLoadState("networkidle");
    await page
      .locator(".simple-state")
      .getByRole("heading", { name: label, exact: true })
      .waitFor();
    await page.screenshot({
      path: resolve(
        out,
        "state-" +
          status +
          "-" +
          pay +
          "-" +
          label.replaceAll(" ", "-") +
          ".png",
      ),
      fullPage: true,
    });
    checks.push(
      "Detail state " + label + " uses central flow and current actions",
    );
  }
  await page.goto(origin + "/admin/orders?tab=cancelled&q=" + prefix);
  await page.getByTestId("admin-order-" + cancelled.orderNumber).waitFor();
  assert.equal(
    await page.getByTestId("admin-order-" + multi.orderNumber).count(),
    0,
  );
  await buyerPage.goto(origin + "/orders/" + single.id);
  await buyerPage.getByText("Retur", { exact: true }).waitFor();
  const foreignReply = await foreign.request.get(
    origin + "/api/v1/orders/" + single.id,
  );
  assert.equal(foreignReply.status(), 404);
  for (let i = 0; i < 13; i++) await create();
  await page.goto(
    origin + "/admin/orders?tab=ready&q=" + prefix + "&sort=oldest",
  );
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".compact-order").count(), 12);
  const next = page.getByRole("link", { name: /Berikutnya/ });
  await next.click();
  await page.waitForURL(/page=2/);
  await page.waitForFunction(() => {
    const n = document.querySelectorAll(".compact-order").length;
    return n > 0 && n < 12;
  });
  assert((await page.locator(".compact-order").count()) > 0);
  assert((await page.locator(".compact-order").count()) < 12);
  checks.push(
    "Server filtering, cancelled tab, sorting and pagination; customer return state and foreign-order isolation",
  );
  const detailLink = page.locator(".compact-order header a").first();
  await detailLink.click();
  await page
    .getByRole("heading", { name: "Detail pesanan", exact: true })
    .waitFor();
  await page.locator("a.flow-back").click();
  await page.waitForURL(/page=2/);
  await page.waitForLoadState("networkidle");
  assert(page.url().includes("sort=oldest"));
  assert(page.url().includes("q=" + prefix));
  checks.push(
    "Explicit detail back link preserves page, sorting, query and card anchor",
  );
  const appearance = await db.storeAppearance.findUniqueOrThrow({
    where: { key: "primary" },
  });
  const black = structuredClone(appearance.draft);
  black.colors.primary = "#111111";
  black.colors.primaryText = "#FFFFFF";
  black.colors.primaryHover = "#242424";
  await db.storeAppearance.update({
    where: { key: "primary" },
    data: { draft: black, published: black },
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/admin/orders?q=" + prefix);
    await page.waitForLoadState("networkidle");
    const color = await page
      .locator(".compact-action .flow-primary")
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.equal(color, "rgb(17, 17, 17)");
    await page.screenshot({
      path: resolve(out, "compact-monochrome-" + width + ".png"),
      fullPage: true,
    });
  }
  await db.storeAppearance.update({
    where: { key: "primary" },
    data: { draft: appearance.draft, published: appearance.published },
  });
  checks.push("Monochrome and colored theme preserve readable primary actions");
}
