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
  checks,
  out,
  run,
}) {
  await buyerPage.route("**/fixture-product*.svg", (r) =>
    r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="600"><rect width="500" height="600" fill="#9aaca8"/></svg>' }),
  );
  await buyerPage.route("**/_next/image?*", (r) =>
    r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="600"><rect width="500" height="600" fill="#eee"/><path d="M150 90 70 180 120 230 160 200 150 530 350 530 340 200 380 230 430 180 350 90 300 70 250 120 200 70Z" fill="#9aaca8"/></svg>',
    }),
  );
  const state = (
    await (
      await admin.request.get(origin + "/api/v1/admin/store-appearance")
    ).json()
  ).data;
  const identity = {
    ...state.config.identity,
    name: "Toko Referensi",
    description: "Koleksi harian pilihan.",
    operationalAddress: "Jalan Uji, Batang, Jawa Tengah",
    whatsapp: "081234567890",
    showWhatsApp: true,
    serviceHours: "Senin–Sabtu, 08.00–17.00 WIB",
  };
  const save = await admin.request.post(
    origin + "/api/v1/admin/store-information",
    {
      headers: { Origin: origin },
      data: {
        identity,
        draftVersion: state.draftVersion,
        publishedVersion: state.publishedVersion,
      },
    },
  );
  assert.equal(save.status(), 200, await save.text());
  const current = (await save.json()).data;
  assert.equal(current.identity.whatsapp, "6281234567890");
  const denied = await customer.request.post(
    origin + "/api/v1/admin/store-information",
    { headers: { Origin: origin }, data: { identity, ...current } },
  );
  assert.equal(denied.status(), 403);
  const stale = await admin.request.post(
    origin + "/api/v1/admin/store-information",
    {
      headers: { Origin: origin },
      data: {
        identity,
        draftVersion: state.draftVersion,
        publishedVersion: state.publishedVersion,
      },
    },
  );
  assert.equal(stale.status(), 409);
  const invalid = await admin.request.post(
    origin + "/api/v1/admin/store-information",
    {
      headers: { Origin: origin },
      data: {
        identity: { ...identity, whatsapp: "", showWhatsApp: true },
        draftVersion: current.draftVersion,
        publishedVersion: current.publishedVersion,
      },
    },
  );
  assert.equal(invalid.status(), 422);
  checks.push(
    "Public identity stored/canonical phone, optimistic revision, invalid chat rejected, customer write denied",
  );
  await db.product.update({
    where: { id: variant.productId },
    data: { status: "PUBLISHED" },
  });
  const product = await db.product.create({
    data: {
      slug: "pdp-" + run,
      name: "Blouse Anita Kemeja Linen Premium",
      description: "Deskripsi asli. ".repeat(40),
      basePrice: 29000,
      status: "PUBLISHED",
      images: {
        create: [{
          url: "/fixture-product.svg",
          alt: "Produk uji",
          sortOrder: 0,
        }, { url: "/fixture-product-second.svg", alt: "Foto kedua", sortOrder: 1 }],
      },
      variants: {
        create: [
          {
            sku: "B-M-" + run,
            color: "Biru",
            size: "M",
            inventory: { create: { onHand: 4 } },
          },
          {
            sku: "H-L-" + run,
            color: "Hijau",
            size: "L",
            inventory: { create: { onHand: 4 } },
          },
        ],
      },
    },
  });
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await buyerPage.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/admin/settings/store");
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.screenshot({
      path: resolve(out, `settings-${width}.png`),
      fullPage: true,
    });
    await buyerPage.goto(origin + "/product/" + product.slug);
    await buyerPage.waitForLoadState("networkidle");
    const grid = buyerPage.locator('.pdp-related-grid');
    assert.equal(await grid.evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length), width < 768 ? 2 : 4);
    assert.equal(await grid.locator('.product-card').first().evaluate(e => {
      e.setAttribute('data-wide-price', 'true');
      return getComputedStyle(e).gridColumn;
    }), 'auto', 'Discount/long prices must not expand a recommendation across both columns');
    assert.equal(
      await buyerPage.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await buyerPage.screenshot({
      path: resolve(out, `product-${width}.png`),
      fullPage: true,
    });
    const chat = buyerPage.getByRole("link", {
      name: "Chat toko melalui WhatsApp",
    });
    await chat.waitFor();
    const href = new URL(await chat.getAttribute("href"));
    assert.equal(href.origin, "https://wa.me");
    assert.equal(href.searchParams.get("text").includes("Variasi:"), false);
    await buyerPage.getByTestId("add-to-cart-btn").dispatchEvent("click");
    await buyerPage
      .getByRole("alert")
      .filter({ hasText: "Pilih warna dan ukuran terlebih dahulu" })
      .waitFor();
    assert.equal(
      await buyerPage
        .getByRole("button", { name: "Biru", exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    const box = await buyerPage
      .getByRole("button", { name: "Biru", exact: true })
      .boundingBox();
    assert(box.y > 60 && box.y + box.height < 900 - 80);
    await buyerPage.getByRole("button", { name: "Biru", exact: true }).click();
    await buyerPage.getByTestId("buy-now-btn").dispatchEvent("click");
    await buyerPage
      .getByText("Pilih ukuran terlebih dahulu.", { exact: true })
      .waitFor();
    await buyerPage.getByRole("button", { name: "M", exact: true }).click();
    assert(
      new URL(await chat.getAttribute("href")).searchParams
        .get("text")
        .includes("Variasi: Biru • M"),
    );
    assert.equal(await buyerPage.locator('.pdp-gallery-dots button').count(), 2);
    await buyerPage.locator('.pdp-gallery-frame').evaluate(e => {
      window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 80);
    });
    assert.equal(await buyerPage.locator('.pdp-zoom').evaluate(e => {
      const r = e.getBoundingClientRect();
      return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), true, 'Multi-photo indicator must not intercept the zoom target');
    await buyerPage.locator('.pdp-gallery-dots button').nth(1).click();
    assert.equal(await buyerPage.locator('.pdp-count').textContent(), '2/2');
    await buyerPage.locator('.pdp-gallery-dots button').first().click();
    assert.equal(await buyerPage.locator('.pdp-count').textContent(), '1/2');
    await buyerPage
      .getByRole("button", { name: "Perbesar foto produk" })
      .click();
    await buyerPage.getByRole("dialog").waitFor();
    await buyerPage.keyboard.press("Escape");
    await buyerPage.getByRole("dialog").waitFor({ state: "hidden" });
    checks.push(
      `PDP and settings ${width}: no overflow, WhatsApp encoded, attribute feedback/focus, zoom Escape`,
    );
  }
  await buyerPage.getByTestId("add-to-cart-btn").click();
  await buyerPage.getByTestId("cart-success-sheet").waitFor();
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
  await buyerPage.keyboard.press("Escape");
  await buyerPage.goto(origin + "/product/" + product.slug);
  await buyerPage.getByRole("button", { name: "Biru", exact: true }).click();
  await buyerPage.getByRole("button", { name: "M", exact: true }).click();
  const before = await db.cartItem.findMany({
    where: { cart: { userId: buyer.id } },
  });
  await buyerPage.getByTestId("buy-now-btn").click();
  await buyerPage.waitForURL(/\/checkout\?intent=/);
  assert.deepEqual(
    await db.cartItem.findMany({ where: { cart: { userId: buyer.id } } }),
    before,
  );
  checks.push("Cart success and direct checkout preserve existing cart");
  for (const [old, target] of [
    ["/admin/shipping?q=keep", "/admin/settings/shipping/manual?q=keep"],
    ["/admin/bank-accounts", "/admin/settings/bank-accounts"],
    ["/admin/audit", "/admin/settings/audit"],
    ["/admin/updates", "/admin/settings/updates"],
    ["/admin/categories", "/admin/products/categories"],
    ["/admin/integrations/jnt", "/admin/settings/shipping/jnt"],
  ]) {
    await page.goto(origin + old);
    await page.waitForURL(origin + target);
    checks.push("Compatibility redirect " + old);
  }
  for (const route of [
    "seller",
    "security",
    "payment-methods",
    "shipping",
    "shipping/print",
    "email-otp",
  ]) {
    assert.equal(
      (await page.goto(origin + "/admin/settings/" + route)).status(),
      200,
    );
    await page.waitForLoadState("networkidle");
  }
  await page.goto(origin + "/admin/settings/store");
  await page.getByLabel("Nama toko", { exact: true }).fill("Belum disimpan");
  await page
    .getByRole("link", { name: "Pengaturan", exact: true })
    .last()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(
    await page.getByLabel("Nama toko", { exact: true }).inputValue(),
    "Belum disimpan",
  );
  checks.push("Settings routes and unsaved form guard");
}
