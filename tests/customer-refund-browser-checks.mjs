import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
export async function verify({
  db,
  origin,
  admin,
  customer,
  foreign,
  page,
  buyerPage: p,
  paid,
  checks,
  out,
  create,
  variant,
  api,
}) {
  p.setDefaultTimeout(15000);
  const endpoint = origin + "/api/v1/order-resolutions";
  const get = async (order = paid) =>
    (
      await (
        await customer.request.get(endpoint + "?orderId=" + order.id)
      ).json()
    ).data;
  const request = async (order) =>
    api(admin, order.id, "request", {
      requestId: randomUUID(),
      kind: "CANCEL",
      reason: "Stok habis",
    });
  const c = await request(paid);
  await api(admin, c.id, "command", { action: "confirm-cancel", revision: 0 });
  const path = `/orders/${paid.id}/resolution?case=${c.id}`;
  const anonymous = await p.context().browser().newContext();
  try {
    const login = await anonymous.newPage();
    await login.goto(origin+path);
    await login.waitForURL(/\/login\?redirectTo=/,{timeout:15000});
    assert.equal(await login.locator('.customer-refund').count(),0);
  } finally {await anonymous.close();}
  const foreignPage=await foreign.newPage();
  try {
    await foreignPage.goto(origin+path);
    await foreignPage.getByRole('heading',{name:'404',exact:true}).waitFor();
    assert.equal(await foreignPage.locator('.customer-refund').count(),0);
  } finally {await foreignPage.close();}
  checks.push('Refund page redirects expired sessions and conceals foreign orders with not-found UI');
  const goto = async (url) => {
    assert.equal((await p.goto(origin + url)).status(), 200);
    await p.waitForLoadState("networkidle");
  };
  const save = () =>
    p.getByRole("button", { name: "Simpan rekening", exact: true });
  const fill = async (number = "000001234567890123456789012345") => {
    await p.getByLabel("Bank", { exact: true }).fill("Bank Demo");
    await p.getByLabel("Nomor rekening", { exact: true }).fill(number);
    await p
      .getByLabel("Nama pemilik rekening", { exact: true })
      .fill("Pembeli Demo");
  };
  for (const width of [360, 390, 430, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    for (const [url, name] of [
      ["/orders", "orders"],
      [`/orders/${paid.id}`, "detail"],
      [path, "refund"],
    ]) {
      await goto(url);
      assert.equal(await p.locator("[data-storefront-header]").count(), 1);
      assert.equal(
        await p.locator("[data-storefront-header]").isVisible(),
        true,
      );
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        `${name} overflow at ${width}`,
      );
      await p.screenshot({
        path: resolve(out, `customer-${name}-${width}.png`),
        fullPage: true,
      });
      await p.evaluate(() => window.scrollTo(0, 500));
      assert.equal(
        Math.round(
          (await p.locator("[data-storefront-header]").boundingBox()).y,
        ),
        0,
      );
      checks.push(
        `${name} ${width}: single sticky header / no horizontal overflow`,
      );
    }
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await goto("/orders");
  const nav = p.getByRole("navigation", { name: "Status pesanan" });
  assert.equal(
    await nav.evaluate((n) => getComputedStyle(n).scrollbarWidth),
    "none",
  );
  const cancelled = nav.getByRole("link", { name: /Dibatalkan/ });
  await cancelled.focus();
  await p.keyboard.press("Enter");
  await p.waitForURL("**/orders?tab=cancelled*");
  assert.equal(
    await p
      .getByRole("navigation", { name: "Status pesanan" })
      .locator("[aria-current=page]")
      .evaluate((el) => {
        const n = el.parentElement.getBoundingClientRect(),
          r = el.getBoundingClientRect();
        return r.left >= n.left - 1 && r.right <= n.right + 1;
      }),
    true,
  );
  checks.push(
    "Hidden scrollbar retains keyboard access, active tab and filter",
  );
  await goto(path);
  await save().click();
  assert.equal(await p.locator("[aria-invalid=true]").count(), 3);
  assert.equal(await p.evaluate(() => document.activeElement.name), "bank");
  checks.push(
    "Invalid form shows inline errors and focuses first invalid field",
  );
  await p.getByLabel("Bank", { exact: true }).fill("Bank Demo");
  await save().click();
  assert.equal(await p.evaluate(() => document.activeElement.name), "number");
  await fill();
  await p.route("**/api/v1/order-resolutions", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { message: "Layanan uji tidak tersedia" },
      }),
    }),
  );
  await save().click();
  await p
    .getByRole("alert")
    .filter({ hasText: "Layanan uji tidak tersedia" })
    .waitFor();
  assert.equal(
    await p.getByLabel("Nomor rekening", { exact: true }).inputValue(),
    "000001234567890123456789012345",
  );
  assert.equal(await p.locator(".customer-status-toast").count(), 0);
  await p.unroute("**/api/v1/order-resolutions");
  checks.push(
    "HTTP error preserves draft, returns button label and never shows success",
  );
  await p.route("**/api/v1/order-resolutions", (route) =>
    route.abort("failed"),
  );
  await save().click();
  await p
    .getByRole("alert")
    .filter({ hasText: "belum terkonfirmasi" })
    .waitFor();
  await p.unroute("**/api/v1/order-resolutions");
  checks.push("Network failure reconciles before allowing another bank write");
  await p.route("**/api/v1/order-resolutions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { message: "Rekening belum dapat diproses" },
      }),
    }),
  );
  await save().click();
  await p
    .getByRole("alert")
    .filter({ hasText: "Rekening belum dapat diproses" })
    .waitFor();
  assert.equal(await p.locator(".customer-status-toast").count(), 0);
  await p.unroute("**/api/v1/order-resolutions");
  checks.push("Business failure with HTTP 200 does not announce success");
  await p.route("**/api/v1/order-resolutions**", (route) =>
    route.abort("failed"),
  );
  await save().click();
  await p
    .getByRole("button", { name: "Periksa status", exact: true })
    .waitFor();
  await p.unroute("**/api/v1/order-resolutions**");
  let statusPosts = 0;
  await p.route("**/api/v1/order-resolutions", (route) => {
    statusPosts++;
    return route.continue();
  });
  await p.getByRole("button", { name: "Periksa status", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: "Status terbaru dimuat" })
    .waitFor();
  assert.equal(statusPosts, 0);
  await p.unroute("**/api/v1/order-resolutions");
  checks.push(
    "Unknown outcome blocks another write until status is reconciled",
  );
  let posts = 0,
    release;
  const hold = new Promise((r) => (release = r));
  await p.route("**/api/v1/order-resolutions", async (route) => {
    posts++;
    await hold;
    await route.continue();
  });
  await save().click();
  await p.getByRole("button", { name: "Menyimpan…", exact: true }).waitFor();
  assert.equal(
    await p
      .getByRole("button", { name: "Menyimpan…", exact: true })
      .isDisabled(),
    true,
  );
  await p.locator("form[aria-busy=true]").evaluate((f) => {
    f.requestSubmit();
    f.requestSubmit();
  });
  assert.equal(posts, 1);
  release();
  await p.getByText("Rekening berhasil disimpan", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Ubah rekening", exact: true }).waitFor();
  assert.equal(
    (await get()).cases[0].bank.number,
    "000001234567890123456789012345",
  );
  const toastBox = await p.locator(".customer-status-toast").boundingBox(),
    headerBox = await p.locator("[data-storefront-header]").boundingBox();
  assert(toastBox.y >= headerBox.y + headerBox.height);
  assert.equal(
    await p
      .locator(".customer-status-toast")
      .evaluate((e) => getComputedStyle(e).pointerEvents),
    "none",
  );
  await p.screenshot({
    path: resolve(out, "customer-bank-saved-toast-390.png"),
    fullPage: false,
  });
  await p.unroute("**/api/v1/order-resolutions");
  checks.push(
    "Slow request announces loading; repeated submits write once; committed bank/status/toast update",
  );
  await p.reload();
  await p.getByText("•••• 2345", { exact: false }).waitFor();
  assert.equal(
    await p.getByLabel("Nomor rekening", { exact: true }).count(),
    0,
  );
  await goto(`/orders/${paid.id}`);
  await p
    .getByRole("link", { name: "Lihat pengembalian dana", exact: true })
    .waitFor();
  assert.equal(
    await p.getByRole("link", { name: "Isi rekening pengembalian" }).count(),
    0,
  );
  await p.goBack();
  await p.getByRole("button", { name: "Ubah rekening", exact: true }).waitFor();
  await p.goForward();
  await p
    .getByRole("link", { name: "Lihat pengembalian dana", exact: true })
    .waitFor();
  checks.push(
    "Refresh and browser history preserve saved bank and updated detail CTA",
  );
  await page.goto(origin + `/admin/orders/${paid.id}/resolution?case=${c.id}`);
  await page
    .getByText("000001234567890123456789012345", { exact: false })
    .first()
    .waitFor();
  checks.push(
    "Seller sees identical destination from persisted encrypted bank",
  );
  await goto(path);
  await p.getByRole("button", { name: "Ubah rekening", exact: true }).click();
  await fill("000999888777");
  let uncertainPosts = 0;
  await p.route("**/api/v1/order-resolutions", async (route) => {
    uncertainPosts++;
    await route.fetch();
    await route.abort("timedout");
  });
  await save().click();
  await p.getByText("Rekening berhasil disimpan", { exact: true }).waitFor();
  await p.getByText("•••• 8777", { exact: false }).waitFor();
  assert.equal(uncertainPosts, 1);
  assert.equal((await get()).cases[0].bank.number, "000999888777");
  await p.unroute("**/api/v1/order-resolutions");
  checks.push(
    "Response timeout after commit reconciles to saved bank without a second write",
  );
  const current = (await get()).cases[0];
  await p.getByRole("button", { name: "Ubah rekening", exact: true }).click();
  await fill("000111222333");
  await api(admin, c.id, "command", {
    action: "prepare-transfer",
    revision: current.revision,
    attested: true,
  });
  await save().click();
  await p.getByRole("alert").waitFor();
  assert.equal(
    await p.getByRole("button", { name: "Ubah rekening", exact: true }).count(),
    0,
  );
  assert.equal((await get()).cases[0].bank.number, "000999888777");
  checks.push(
    "Concurrent seller transfer locks account and rejects stale customer edit",
  );
  for (const [method, url, data] of [
    ["get", endpoint + "?orderId=" + paid.id],
    [
      "post",
      endpoint,
      {
        id: c.id,
        operation: "command",
        data: {
          action: "bank",
          revision: current.revision,
          bank: { bank: "Other", holder: "Other", number: "123456" },
        },
      },
    ],
  ]) {
    const r = await foreign.request[method](url, {
      headers: { Origin: origin },
      ...(data ? { data } : {}),
    });
    assert.equal(r.status(), 404);
  }
  checks.push("Foreign customer cannot read or mutate refund");
  const unpaid = await create("PENDING_PAYMENT", "PENDING_PAYMENT"),
    uc = await request(unpaid);
  await db.inventory.update({
    where: { variantId: variant.id },
    data: { reserved: { increment: 2 } },
  });
  await api(admin, uc.id, "command", { action: "confirm-cancel", revision: 0 });
  await goto(`/orders/${unpaid.id}`);
  assert.equal(
    await p
      .getByText("Penjual akan mengembalikan dana", { exact: true })
      .count(),
    0,
  );
  await goto(`/orders/${unpaid.id}/resolution?case=${uc.id}`);
  assert.equal(
    await p.getByLabel("Nomor rekening", { exact: true }).count(),
    0,
  );
  checks.push("Unpaid cancellation has no false refund promise or bank form");
  const locked = (await get()).cases[0];
  const uploaded = await admin.request.post(endpoint, {
    headers: { Origin: origin },
    multipart: {
      id: c.id,
      kind: "transfer",
      revision: String(locked.revision),
      amount: String(locked.refundAmount),
      reference: "TEST-" + randomUUID(),
      settledAt: new Date().toISOString(),
      attested: "true",
      file: {
        name: "refund-proof.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7\n Synthetic test proof"),
      },
    },
  });
  assert.equal(uploaded.status(), 200, await uploaded.text());
  await goto(path);
  await p
    .locator(".refund-badge")
    .filter({ hasText: "Transfer dicatat penjual" })
    .waitFor();
  assert.equal(
    await p
      .getByRole("button", { name: "Konfirmasi dana diterima", exact: true })
      .isDisabled(),
    true,
  );
  const transferred = (await get()).cases[0];
  const proof = endpoint + "/proof?kind=transfer&id=" + transferred.transfer.id;
  assert.equal((await customer.request.get(proof)).status(), 200);
  assert.equal((await foreign.request.get(proof)).status(), 404);
  await p
    .getByLabel("Saya sudah memeriksa rekening dan menerima dana.")
    .check();
  await p
    .getByRole("button", { name: "Konfirmasi dana diterima", exact: true })
    .click();
  await p
    .locator(".refund-badge")
    .filter({ hasText: "Penerimaan dana dikonfirmasi" })
    .waitFor();
  assert.equal((await get()).paymentStatus, "REFUNDED");
  checks.push(
    "Real UI receipt confirmation closes recorded refund; protected proof rejects foreign account",
  );
  const partial = await create("COMPLETED", "PAID");
  const pc = await api(admin, partial.id, "request", {
    requestId: randomUUID(),
    kind: "RETURN",
    reason: "Satu produk perlu dikembalikan",
  });
  const item = await db.orderItem.findFirstOrThrow({
    where: { orderId: partial.id },
  });
  await api(admin, pc.id, "command", {
    action: "approve-return",
    revision: 0,
    items: [{ orderItemId: item.id, quantity: 1 }],
    shippingAmount: 0,
    returnRequired: true,
    policyReason: "Satu produk disetujui untuk retur",
  });
  const partialPath = `/orders/${partial.id}/resolution?case=${pc.id}`;
  await goto(partialPath);
  assert.equal(
    (await p.getByText("Rp 29.000", { exact: true }).count()) >= 2,
    true,
  );
  await p.getByRole("heading", { name: "Pengiriman retur" }).waitFor();
  assert.equal(
    await p
      .getByText("Anda telah mengonfirmasi dana diterima.", { exact: true })
      .count(),
    0,
  );
  checks.push(
    "Partial return uses approved line allocation and shipping; retains return action without premature receipt",
  );
  await p.emulateMedia({ reducedMotion: "reduce" });
  await goto(partialPath);
  await fill();
  assert.equal(
    await save().evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(36, 60, 99)",
  );
  await save().click();
  await p.getByText("Rekening berhasil disimpan", { exact: true }).waitFor();
  assert.equal(
    await p
      .locator(".customer-status-toast")
      .evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  checks.push(
    "Active store theme, readable action contrast and reduced-motion toast",
  );
  await p.getByRole("button", { name: "Ubah rekening", exact: true }).click();
  await fill("000998877665");
  let committed, releaseResponse;
  const didCommit = new Promise((r) => (committed = r)),
    deliver = new Promise((r) => (releaseResponse = r));
  await p.route("**/api/v1/order-resolutions", async (route) => {
    const response = await route.fetch();
    committed();
    await deliver;
    await route.fulfill({ response }).catch(() => {});
  });
  await save().click();
  await didCommit;
  await goto(`/orders/${unpaid.id}`);
  releaseResponse();
  await p.unrouteAll({ behavior: "wait" });
  assert.equal(await p.locator(".customer-status-toast").count(), 0);
  assert.equal((await get(partial)).cases[0].bank.number, "000998877665");
  checks.push(
    "Unmounted refund form does not put stale success or state onto another order",
  );
}
