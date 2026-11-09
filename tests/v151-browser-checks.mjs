import assert from "node:assert/strict";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { PDFDocument } = require("../app/node_modules/pdf-lib");
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
  paid,
  checks,
  out,
  run,
}) {
  const overflow = async (p) =>
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  // Dedicated routes, backward compatibility, focus restoration and unsaved state.
  for (const width of process.env.V151_FAST ? [390] : [360, 390, 430, 1440]) {
    await buyerPage.setViewportSize({ width, height: 900 });
    for (const section of [
      "profile",
      "addresses",
      "security",
      "help",
      "delete",
    ]) {
      assert.equal(
        (await buyerPage.goto(`${origin}/account/${section}`)).status(),
        200,
      );
      await buyerPage.waitForLoadState("networkidle");
      await overflow(buyerPage);
      assert.equal(
        (await buyerPage.locator(".account-settings form").count()) <= 2,
        true,
      );
      await buyerPage.screenshot({
        path: resolve(out, `account-${section}-${width}.png`),
      });
    }
  }
  await buyerPage.goto(origin + "/account/settings?section=security");
  await buyerPage.waitForURL("**/account/security");
  await buyerPage.goto(origin + "/account/profile");
  await buyerPage.getByLabel("Nama", { exact: true }).fill("Belum disimpan");
  await buyerPage.getByRole("link", { name: /Kembali ke Akun/ }).click();
  await buyerPage.getByRole("dialog").waitFor();
  await buyerPage
    .getByRole("dialog")
    .getByRole("button", { name: "Kembali", exact: true })
    .click();
  assert.equal(
    await buyerPage.getByLabel("Nama", { exact: true }).inputValue(),
    "Belum disimpan",
  );
  await buyerPage.getByRole("link", { name: /Kembali ke Akun/ }).click();
  await buyerPage
    .getByRole("dialog")
    .getByRole("button", { name: "Tinggalkan halaman" })
    .click();
  await buyerPage.waitForURL(origin + "/account");
  await buyerPage.goto(origin + "/account/delete");
  await buyerPage
    .getByLabel("Password saat ini", { exact: true })
    .fill("WrongPassword!123");
  await buyerPage.getByRole("checkbox").check();
  await buyerPage
    .getByRole("button", { name: "Hapus Akun Permanen", exact: true })
    .click();
  await buyerPage.getByRole("dialog").waitFor();
  await buyerPage
    .getByRole("dialog")
    .getByRole("button", { name: "Hapus Akun", exact: true })
    .click();
  await buyerPage.getByRole("dialog").getByRole("alert").waitFor();
  assert.equal(
    await buyerPage
      .getByLabel("Password saat ini", { exact: true })
      .inputValue(),
    "WrongPassword!123",
  );
  await buyerPage.keyboard.press("Escape");
  await buyerPage.getByRole("dialog").waitFor({ state: "hidden" });
  await buyerPage.getByRole("link", { name: /Kembali ke Akun/ }).click();
  await buyerPage
    .getByRole("dialog")
    .getByRole("button", { name: "Tinggalkan halaman" })
    .click();
  await buyerPage.waitForURL(origin + "/account");
  console.log("V151_BROWSER_STAGE_PASS");
  checks.push(
    "Dedicated account routes at 360/390/430/1440, legacy redirect and unsaved form stay/leave",
  );
  // Owner-scoped tab/search and visible actual payment CTA.
  const unpaid = await db.order.create({
    data: {
      orderNumber: "UNPAID-" + run.slice(0, 8),
      userId: buyer.id,
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING_PAYMENT",
      subtotal: 29000,
      total: 36000,
      shippingCost: 7000,
      expiresAt: new Date(Date.now() + 3600000),
      items: {
        create: {
          variantId: variant.id,
          quantity: 1,
          unitPrice: 29000,
          lineTotal: 29000,
          productName: "Produk Belum Bayar",
          variantLabel: "Biru / M",
        },
      },
      payment: {
        create: {
          provider: "manual",
          status: "PENDING_PAYMENT",
          amount: 36000,
        },
      },
    },
  });
  const cancelled = await db.order.create({
    data: {
      orderNumber: "CANCELLED-" + run.slice(0, 8),
      userId: buyer.id,
      status: "CANCELLED",
      paymentStatus: "PENDING_PAYMENT",
      subtotal: 29000,
      total: 36000,
      shippingCost: 7000,
      items: {
        create: {
          variantId: variant.id,
          quantity: 1,
          unitPrice: 29000,
          lineTotal: 29000,
          productName: "Produk Dibatalkan",
          variantLabel: "Biru / M",
        },
      },
    },
  });
  await buyerPage.goto(origin + "/orders");
  const row = buyerPage.getByTestId("order-row-" + unpaid.orderNumber),
    pay = row.getByRole("link", { name: "Bayar sekarang", exact: true });
  await pay.waitFor();
  assert.equal(
    await pay.getAttribute("href"),
    "/checkout/payment/" + unpaid.id,
  );
  const colors = await pay.evaluate((e) => ({
    bg: getComputedStyle(e).backgroundColor,
    fg: getComputedStyle(e).color,
  }));
  assert.notEqual(colors.bg, colors.fg);
  assert.notEqual(colors.fg, "rgba(0, 0, 0, 0)");
  assert.equal(
    await buyerPage
      .getByTestId("order-row-" + waiting.orderNumber)
      .getByRole("link", { name: "Bayar sekarang" })
      .count(),
    0,
  );
  assert.equal(
    await buyerPage
      .getByTestId("order-row-" + paid.orderNumber)
      .getByRole("link", { name: "Bayar sekarang" })
      .count(),
    0,
  );
  for (const width of process.env.V151_FAST ? [390] : [360, 390, 430, 1440]) {
    await buyerPage.setViewportSize({ width, height: 900 });
    await overflow(buyerPage);
    await buyerPage.screenshot({
      path: resolve(out, `customer-orders-${width}.png`),
    });
  }
  await buyerPage.getByRole("link", { name: /Dibatalkan/ }).click();
  await buyerPage.waitForURL(/tab=cancelled/);
  await buyerPage.getByTestId("order-row-" + cancelled.orderNumber).waitFor();
  assert.equal(
    await buyerPage.getByTestId("order-row-" + unpaid.orderNumber).count(),
    0,
  );
  await buyerPage
    .getByRole("textbox", { name: "Cari pesanan" })
    .fill("Produk Dibatalkan");
  await buyerPage
    .locator(".customer-order-search")
    .getByRole("button", { name: "Cari", exact: true })
    .click();
  await buyerPage.waitForURL(/q=Produk/);
  await buyerPage.getByTestId("order-row-" + cancelled.orderNumber).waitFor();
  const denied = await foreign.request.get(origin + "/orders/" + unpaid.id);
  assert(
    !(await denied.text()).includes(unpaid.orderNumber),
    "Foreign buyer sees no order data",
  );
  assert.equal(
    (
      await foreign.request.get(
        origin + "/api/v1/order-resolutions?orderId=" + unpaid.id,
      )
    ).status(),
    404,
  );
  console.log("V151_BROWSER_STAGE_PASS");
  checks.push(
    "Visible themed pay link; no duplicate pay on paid/verifying; cancelled tab/search owner isolation",
  );
  // Real authenticated PDF endpoint and print selector; GET only, no carrier dispatch.
  const shipmentRequests = await db.jntShipmentRequest.count();
  for (const size of ["75x150", "100x150"]) {
    const r = await admin.request.get(
      `${origin}/api/v1/admin/orders/${shipping.id}/awb?size=${size}`,
    );
    assert.equal(r.status(), 200, await r.text());
    const data = await r.body(),
      pdf = await PDFDocument.load(data),
      p = pdf.getPage(0);
    assert(
      Math.abs((p.getWidth() * 25.4) / 72 - Number(size.split("x")[0])) < 0.1,
    );
    assert(Math.abs((p.getHeight() * 25.4) / 72 - 150) < 0.1);
    writeFileSync(resolve(out, `authenticated-awb-${size}.pdf`), data);
  }
  assert.equal(
    (
      await admin.request.get(
        `${origin}/api/v1/admin/orders/${shipping.id}/awb?size=bad`,
      )
    ).status(),
    422,
  );
  assert.notEqual(
    (
      await customer.request.get(
        `${origin}/api/v1/admin/orders/${shipping.id}/awb?size=75x150`,
      )
    ).status(),
    200,
  );
  await page.goto(`${origin}/admin/orders/${shipping.id}`);
  const print = page.getByRole("button", { name: "Cetak AWB", exact: true });
  await print.click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Ukuran label" })
    .selectOption("75x150");
  await dialog.locator("iframe").waitFor();
  await dialog
    .getByRole("button", { name: "Cetak", exact: true })
    .waitFor({ state: "visible" });
  await page.screenshot({ path: resolve(out, "print-dialog-390.png") });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await print.evaluate((e) => e === document.activeElement),
    true,
    "Restore print trigger focus",
  );
  assert.equal(await db.jntShipmentRequest.count(), shipmentRequests);
  console.log("V151_BROWSER_STAGE_PASS");
  checks.push(
    "Authenticated 75x150 and existing100x150 PDF; invalid size / customer forbidden; preview Escape/focus; zero new AWB",
  );
  // Checkout quote race/failure in actual rendered component; deterministic network responses.
  await db.product.update({
    where: { id: variant.productId },
    data: { status: "PUBLISHED" },
  });
  await db.shippingSettings.upsert({
    where: { id: 1 },
    update: { manualFlat: 7000, activeJntId: null },
    create: { id: 1, manualFlat: 7000 },
  });
  await db.customer.create({
    data: {
      userId: buyer.id,
      fullName: buyer.name,
      addresses: {
        create: {
          recipientName: buyer.name,
          phone: "081234567890",
          line: "Jalan Uji 11",
          province: "Jawa Tengah",
          city: "Batang",
          district: "Warungasem",
          village: "Banjaran",
          provinceCode: "33",
          cityCode: "33.25",
          districtCode: "33.25.01",
          villageCode: "33.25.01.0001",
          postalCode: "51252",
          isDefault: true,
        },
      },
    },
  });
  await db.cart.create({
    data: {
      userId: buyer.id,
      items: { create: { variantId: variant.id, quantity: 1 } },
    },
  });
  await db.bankAccount.create({
    data: {
      bankName: "Bank Demo",
      displayName: "Transfer Bank Demo",
      accountNumber: "12345678",
      accountHolder: "Toko Contoh",
    },
  });
  let selectedPending,
    previewCount = 0,
    failNext = false;
  await buyerPage.route("**/api/v1/checkout/preview", async (route) => {
    const b = route.request().postDataJSON();
    previewCount++;
    if (failNext) {
      failNext = false;
      return route.fulfill({
        status: 503,
        json: { success: false, error: { message: "Jaringan uji terputus" } },
      });
    }
    if (b.shipping) await new Promise((r) => (selectedPending = r));
    await route.fulfill({
      json: {
        success: true,
        data: {
          subtotal: 29000,
          shippingCost: b.shipping ? 7000 : 0,
          total: 29000 + (b.shipping ? 7000 : 0),
          discount: 0,
          couponCode: null,
          couponReason: null,
          shippingValid: !!b.shipping,
          quoteExpiresAt: Date.now() + 60000,
          shippingRates: [
            {
              courier: "manual",
              service: "Reguler",
              cost: 7000,
              quoteToken: "browser-fixture-token",
              expiresAt: Date.now() + 60000,
              mode: "manual",
            },
          ],
        },
      },
    });
  });
  await buyerPage.goto(origin + "/checkout");
  const choice = buyerPage.getByTestId("ship-option-0");
  await choice.waitFor();
  await choice.locator("input").check();
  await buyerPage.getByText("Memperbarui total…", { exact: true }).waitFor();
  assert.equal(await choice.isVisible(), true);
  assert.equal(await choice.locator("input").isChecked(), true);
  assert.equal(
    await buyerPage.getByTestId("place-order-btn").isDisabled(),
    true,
  );
  const count = previewCount;
  await buyerPage
    .getByLabel("Nama Penerima", { exact: true })
    .fill("Nama Baru");
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(previewCount, count, "Typing recipient does not refetch quote");
  selectedPending();
  await buyerPage.getByTestId("place-order-btn").waitFor();
  await buyerPage.waitForFunction(
    () => !document.querySelector("[data-testid=place-order-btn]").disabled,
  );
  assert.match(
    await buyerPage.getByTestId("checkout-total").innerText(),
    /36.000/,
  );
  for (const width of process.env.V151_FAST ? [390] : [360, 390, 430, 1440]) {
    await buyerPage.setViewportSize({ width, height: 900 });
    await overflow(buyerPage);
    await buyerPage.screenshot({ path: resolve(out, `checkout-${width}.png`) });
  }
  failNext = true;
  await buyerPage.reload();
  await buyerPage
    .getByRole("button", { name: "Coba lagi", exact: true })
    .waitFor();
  assert.equal(
    await buyerPage.getByTestId("place-order-btn").isDisabled(),
    true,
  );
  await buyerPage
    .getByRole("button", { name: "Coba lagi", exact: true })
    .click();
  await buyerPage.getByTestId("ship-option-0").waitFor();
  await buyerPage.unroute("**/api/v1/checkout/preview");
  console.log("V151_BROWSER_STAGE_PASS");
  checks.push(
    "Browser checkout retained service during slow quote; semantic-key no duplicate; total correct; network retry at 4 widths",
  );
  // Multiple required variant groups: no cart POST until complete.
  const product = await db.product.create({
    data: {
      slug: "variants-" + run,
      name: "Produk Variasi Uji",
      status: "PUBLISHED",
      basePrice: 29000,
      variants: {
        create: [
          {
            sku: "B-M-" + run,
            color: "Biru",
            size: "M",
            inventory: { create: { onHand: 3 } },
          },
          {
            sku: "H-L-" + run,
            color: "Hijau",
            size: "L",
            inventory: { create: { onHand: 3 } },
          },
        ],
      },
    },
  });
  await buyerPage.goto(
    origin + "/shop?q=" + encodeURIComponent("Produk Variasi Uji"),
  );
  const card = buyerPage
    .locator("article")
    .filter({ hasText: "Produk Variasi Uji" })
    .first();
  await card.getByRole("button", { name: /keranjang/i }).click();
  const sheet = buyerPage.getByTestId("quick-add-variant-sheet");
  await sheet.waitFor();
  let cartPosts = 0;
  const listener = (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) cartPosts++;
  };
  buyerPage.on("request", listener);
  await sheet
    .getByRole("button", { name: "Masukkan ke Keranjang", exact: true })
    .dispatchEvent("click");
  await sheet.getByText(/Pilih warna dan ukuran terlebih dahulu/).waitFor();
  assert.equal(cartPosts, 0);
  assert.equal(
    await sheet
      .locator("[data-option-group=color] button")
      .first()
      .evaluate((e) => document.activeElement === e),
    true,
  );
  await sheet.getByRole("button", { name: "Biru", exact: true }).click();
  await sheet
    .getByRole("button", { name: "Masukkan ke Keranjang", exact: true })
    .dispatchEvent("click");
  await sheet
    .getByText("Pilih ukuran terlebih dahulu.", { exact: true })
    .waitFor();
  assert.equal(cartPosts, 0);
  await sheet.getByRole("button", { name: "M", exact: true }).click();
  await sheet
    .getByRole("button", { name: "Masukkan ke Keranjang", exact: true })
    .click();
  await buyerPage.waitForFunction(
    () => !document.querySelector("[data-testid=quick-add-variant-sheet]"),
  );
  assert.equal(cartPosts, 1);
  assert.equal(
    await db.cartItem.count({
      where: {
        cart: { userId: buyer.id },
        variant: { productId: product.id },
        quantity: 1,
      },
    }),
    1,
  );
  buyerPage.off("request", listener);
  console.log("V151_BROWSER_STAGE_PASS");
  checks.push(
    "Quick add: missing color/size feedback/focus and no POST, complete selection exactly one cart request",
  );
  // Actual theme CSS in both auth pages, with delayed server action for loading state.
  const anon = await admin.browser().newContext();
  const auth = await anon.newPage();
  for (const theme of ["blue", "black"]) {
    if (theme === "black") {
      const current = (
        await (
          await admin.request.get(origin + "/api/v1/admin/store-appearance")
        ).json()
      ).data;
      const config = structuredClone(current.config || current.draft);
      config.colors.primary = "#111111";
      config.colors.primaryHover = "#242424";
      config.colors.primaryPressed = "#000000";
      let r = await admin.request.post(
        origin + "/api/v1/admin/store-appearance",
        {
          headers: { Origin: origin },
          data: {
            kind: "save",
            draftVersion: current.draftVersion,
            publishedVersion: current.publishedVersion,
            config,
          },
        },
      );
      assert.equal(r.status(), 200, await r.text());
      const saved = (await r.json()).data;
      r = await admin.request.post(origin + "/api/v1/admin/store-appearance", {
        headers: { Origin: origin },
        data: {
          kind: "publish",
          draftVersion: saved.draftVersion,
          publishedVersion: saved.publishedVersion,
        },
      });
      assert.equal(r.status(), 200, await r.text());
    }
    for (const route of ["login", "register"]) {
      await auth.goto(origin + "/" + route);
      await auth.getByTestId("auth-submit").hover();
      const bg = await auth
        .getByTestId("auth-submit")
        .evaluate((e) => getComputedStyle(e).backgroundColor);
      assert.equal(
        bg,
        theme === "blue" ? "rgb(30, 51, 85)" : "rgb(36, 36, 36)",
      );
      if (route === "login") {
        await auth.getByTestId("login-identifier").fill("invalid@example.test");
        await auth.getByTestId("login-password").fill("SyntheticPassword!123");
      } else {
        for (const [id, v] of [
          ["name", "Nama Uji"],
          ["email", run + "@example.test"],
          ["phone", "081234567891"],
          ["password", "SyntheticPassword!123"],
          ["confirm-password", "SyntheticPassword!123"],
        ])
          await auth.getByTestId("register-" + id).fill(v);
        await auth.getByTestId("register-terms").check();
      }
      let release;
      await auth.route("**/" + route, async (r) => {
        if (r.request().method() === "POST") {
          await new Promise((x) => (release = x));
          await r.continue();
        } else await r.continue();
      });
      await auth.getByTestId("auth-submit").click();
      await auth
        .getByTestId("auth-submit")
        .getByText("Memproses...", { exact: true })
        .waitFor();
      assert.equal(await auth.getByTestId("auth-submit").isDisabled(), true);
      assert.equal(
        await auth
          .getByTestId("auth-submit")
          .locator("span")
          .first()
          .evaluate((e) => getComputedStyle(e).opacity),
        "1",
      );
      await auth.screenshot({
        path: resolve(out, `auth-${theme}-${route}-loading.png`),
      });
      release();
      await auth.waitForFunction(
        () => !document.querySelector("[data-testid=auth-submit]")?.disabled,
      );
      await auth.unroute("**/" + route);
    }
  }
  await anon.close();
  console.log("V151_BROWSER_STAGE_PASS");
  checks.push(
    "Auth theme hover/loading visible labels, disabled submit; no external email provider configured",
  );
}
