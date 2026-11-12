import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { PrismaClient } = require("../app/node_modules/@prisma/client"),
  {
    chromium,
    expect: baseExpect,
  } = require("../app/node_modules/@playwright/test");
const expect = baseExpect.configure({ timeout: 20000 });
const { SignJWT } = await import(
  "../app/node_modules/jose/dist/node/esm/index.js"
);
const target = new URL(process.env.DATABASE_URL || "http://invalid");
assert(
  ["127.0.0.1", "localhost"].includes(target.hostname) &&
    target.port === "5557" &&
    target.pathname === "/hubify_promotions_ui_test",
  "Only isolated local promotions DB",
);
const db = new PrismaClient(),
  run = randomUUID(),
  prefix = "UX " + run.slice(0, 8),
  origin = "http://127.0.0.1:3124",
  secret = randomBytes(32).toString("hex"),
  out = resolve("promotion-evidence");
mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
let browser, child, page;
const photo =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="110"><rect width="90" height="110" rx="8" fill="#e8e7e1"/><path d="M28 20L15 35 25 45 30 38V90H60V38L65 45 75 35 62 20 52 25H38Z" fill="#97a993"/></svg>',
  );
try {
  await db.flashSaleControl.upsert({
    where: { key: "primary" },
    create: { key: "primary" },
    update: {},
  });
  await db.shippingSettings.upsert({
    where: { id: 1 },
    create: { id: 1, manualFlat: 5000 },
    update: { manualFlat: 5000, activeJntId: null },
  });
  await db.flashSaleCampaign.updateMany({
    where: { name: { startsWith: "UX " }, status: "SCHEDULED" },
    data: { status: "ENDED" },
  });
  const role = await db.role.upsert({
    where: { name: "Admin" },
    update: {},
    create: { name: "Admin", label: "Admin" },
  });
  for (const key of [
    "product.read",
    "promotion.create",
    "promotion.update",
    "inventory.read",
    "order.read",
  ]) {
    const p = await db.permission.upsert({
      where: { key },
      update: {},
      create: { key, label: key },
    });
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
      update: {},
      create: { roleId: role.id, permissionId: p.id },
    });
  }
  const user = await db.user.create({
    data: {
      name: "Seller Uji Promosi",
      email: run + "@example.test",
      passwordHash: "disabled-local-test",
      roles: { create: { roleId: role.id } },
    },
  });
  const { makeDefault } =
    require("../app/node_modules/tsx/dist/cjs/api/index.cjs").require(
      "../app/src/modules/appearance/schema.ts",
      import.meta.url,
    );
  const config = makeDefault();
  config.identity.name = "Hubify";
  await db.storeAppearance.upsert({
    where: { key: "primary" },
    update: { draft: config, published: config },
    create: { key: "primary", draft: config, published: config },
  });
  const products = [];
  for (let i = 0; i < 22; i++)
    products.push(
      await db.product.create({
        data: {
          name: `${prefix} Produk ${String(i).padStart(2, "0")} dengan pilihan warna dan ukuran`,
          slug: "ux-" + run + "-" + i,
          status: i === 21 ? "DRAFT" : "PUBLISHED",
          basePrice: 43000,
          weightGrams: 500,
          images: { create: { url: photo, sortOrder: 0 } },
          variants: {
            create: [
              {
                sku: run + "-" + i + "-M",
                color: "Sage",
                size: "M",
                price: 43000,
                inventory: { create: { onHand: 10 } },
              },
              {
                sku: run + "-" + i + "-L",
                color: "Cream",
                size: "L",
                price: 49000,
                inventory: { create: { onHand: 15 } },
              },
            ],
          },
        },
        include: { variants: true },
      }),
    );
  const storageRoot = resolve("../audit-tools/promotions-media")
    .replaceAll("\\", "/")
    .replace(/^[A-Za-z]:/, "");
  const log = createWriteStream(resolve(out, "preview.log"));
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      process.env.PROMOTION_PREVIEW_MODE || "dev",
      "-H",
      "127.0.0.1",
      "-p",
      "3124",
    ],
    {
      cwd: resolve("app"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        APP_ORIGIN: origin,
        NEXT_PUBLIC_BASE_URL: origin,
        JWT_SECRET: secret,
        REGION_DATA_MODE: "snapshot",
        STORAGE_LOCAL_ROOT: storageRoot,
        STORE_MAIL_RELAY_TOKEN: "",
        RESEND_API_KEY: "",
        JNT_PRODUCTION_API_APPROVED: "no",
        JNT_PRODUCTION_ORDER_APPROVED: "no",
        JNT_ENABLE_ORDER_CREATE: "no",
        NODE_ENV:
          process.env.PROMOTION_PREVIEW_MODE === "start"
            ? "production"
            : "development",
      },
    },
  );
  mkdirSync(resolve("../audit-tools/promotions-media"), { recursive: true });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(origin + "/api/v1/ready")).ok) break;
    } catch {}
    if (i === 119) throw Error("Preview unavailable");
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.route("**/*", (r) => {
    const u = new URL(r.request().url());
    return ["127.0.0.1", "localhost"].includes(u.hostname) ||
      u.protocol === "data:"
      ? r.continue()
      : r.abort();
  });
  const token = await new SignJWT({
    email: user.email,
    ver: user.sessionVersion,
  })
    .setJti(randomUUID())
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer(origin)
    .setAudience("storefront")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
  await context.addCookies([
    {
      name: "store_session",
      value: token,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(90000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const screenshot = async (name) => {
    await expect(page.locator(".promo-workspace")).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Memuat promosi", exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: resolve(out, name + ".png"),
      fullPage: false,
      animations: "disabled",
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow)
      console.log(
        JSON.stringify(
          await page.evaluate(() => ({
            width: innerWidth,
            scroll: document.documentElement.scrollWidth,
            elements: [...document.querySelectorAll("body *")]
              .filter(
                (e) =>
                  e.getBoundingClientRect().right > innerWidth + 0.5 &&
                  getComputedStyle(e).display !== "none",
              )
              .slice(-15)
              .map((e) => ({
                tag: e.tagName,
                class: e.className,
                right: e.getBoundingClientRect().right,
              })),
          })),
        ),
      );
    assert(!overflow, name + " overflow");
  };
  const base = origin + "/admin/marketing";
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "Promosi", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Flash Sale", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await screenshot("desktop-campaigns");
  await page
    .getByRole("link", { name: "Buat Flash Sale", exact: true })
    .first()
    .click();
  await expect(page.locator("#campaign-name")).toBeVisible();
  const name = prefix + " Akhir Pekan";
  await page.locator("#campaign-name").fill(name);
  const wib = (t) => new Date(t + 7 * 3600000).toISOString().slice(0, 16);
  await page.locator("#campaign-start").fill(wib(Date.now() + 3 * 3600000));
  await page.locator("#campaign-end").fill(wib(Date.now() + 2 * 3600000));
  await page.getByRole("button", { name: "Pilih produk", exact: true }).click();
  await expect(page.locator(".promo-workspace [role=alert]")).toContainText(
    "Waktu berakhir",
  );
  await page.locator("#campaign-end").fill(wib(Date.now() + 4 * 3600000));
  await screenshot("desktop-schedule");
  await page.getByRole("button", { name: "Pilih produk", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tambah produk", exact: true }),
  ).toBeVisible();
  checks.push("Schedule validates WIB and preserves inputs between steps");
  await page
    .getByRole("button", { name: "Tambah produk", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Pilih produk", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Cari produk" }).fill(prefix);
  await expect(dialog.locator(".promo-choice").first()).toContainText(prefix);
  await expect(dialog.locator(".promo-choice")).toHaveCount(20);
  await dialog.locator(".promo-choice input").first().check();
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(page.locator(".promo-sku-card")).toHaveCount(0);
  checks.push("Product picker cancel does not mutate participants");
  await page
    .getByRole("button", { name: "Tambah produk", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Cari produk" }).fill(prefix);
  await expect(dialog.locator(".promo-choice").first()).toContainText(prefix);
  await expect(dialog.locator(".promo-choice")).toHaveCount(20);
  await dialog.locator(".promo-choice input").first().check();
  await dialog.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(dialog.locator(".promo-choice")).toHaveCount(2);
  await expect(dialog.locator(".promo-choice input").last()).toBeDisabled();
  await dialog.locator(".promo-choice input").first().check();
  await screenshot("desktop-product-picker");
  await dialog
    .getByRole("button", { name: "Tambahkan produk", exact: true })
    .click();
  await expect(page.locator(".promo-sku-card")).toHaveCount(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  checks.push(
    "Selections persist across product pagination; unpublished product disabled; single dialog closes after apply",
  );
  for (const i of [0, 20]) {
    const product = products[i];
    await page
      .locator(".promo-sku-card")
      .filter({ hasText: product.name })
      .locator(":scope > details > summary")
      .click();
    for (const v of product.variants) {
      await page
        .getByRole("spinbutton", { name: "Harga promo " + v.sku, exact: true })
        .fill("39000");
      await page
        .getByRole("spinbutton", { name: "Kuota " + v.sku, exact: true })
        .fill("3");
    }
  }
  await screenshot("desktop-products");
  await page.setViewportSize({ width: 390, height: 900 });
  const expanded = page.locator(".promo-sku-card > details[open] > summary");
  while (await expanded.count()) await expanded.first().click();
  await screenshot("mobile-products-new");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Tinjau kampanye", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: name, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await screenshot("desktop-review");
  await page.getByRole("button", { name: "Jadwalkan", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Promosi", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("berhasil");
  const campaign = await db.flashSaleCampaign.findFirstOrThrow({
    where: { name },
    include: { items: { include: { skuOffers: true } } },
  });
  assert.equal(campaign.items.length, 2);
  assert.equal(campaign.items.flatMap((i) => i.skuOffers).length, 4);
  checks.push(
    "Publication creates two products/four SKU offers only after server success",
  );
  const row = page
    .locator("tr")
    .filter({ has: page.getByText(name, { exact: true }) });
  await row.getByRole("link", { name: "Detail", exact: true }).click();
  await expect(page).toHaveURL(/view=detail/);
  await expect(
    page.getByRole("heading", { name: name, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: name, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Kembali ke daftar" }).click();
  await page.getByRole("link", { name: "Voucher", exact: true }).click();
  await page.getByRole("link", { name: "Buat voucher", exact: true }).click();
  const code = "UX" + run.replaceAll("-", "").slice(0, 8).toUpperCase();
  await page.locator("#voucher-code").fill(code);
  await page.locator("#voucher-value").fill("10");
  await page.locator("#voucher-min").fill("100000");
  await page.locator("#voucher-max").fill("20000");
  await expect(page.locator(".promo-voucher-preview")).toContainText("10% OFF");
  await screenshot("desktop-voucher-form");
  await page
    .getByRole("button", { name: "Nominal Rupiah", exact: true })
    .click();
  await expect(page.locator("#voucher-max")).toHaveCount(0);
  await page.locator("#voucher-value").fill("20000");
  await page.getByRole("button", { name: "Buat voucher", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("berhasil");
  const coupon = await db.coupon.findUniqueOrThrow({ where: { code } });
  assert.equal(coupon.maxDiscount, null);
  checks.push(
    "Voucher preview follows inputs; fixed discount clears hidden percentage cap; server save succeeds",
  );
  for (const width of [360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + "?tab=voucher");
    await screenshot("vouchers-" + width);
    await page.goto(
      base + "?tab=flash&view=edit&id=" + campaign.id + "&step=1",
    );
    await expect(page.locator("#campaign-name")).toHaveValue(name);
    await screenshot("schedule-" + width);
    await page.goto(
      base + "?tab=flash&view=edit&id=" + campaign.id + "&step=2",
    );
    await expect(page.locator(".promo-sku-card")).toHaveCount(2);
    await screenshot("products-" + width);
    await page
      .getByRole("button", { name: "Tambah produk", exact: true })
      .click();
    const d = page.getByRole("dialog");
    await expect(d).toBeVisible();
    if (width < 768) {
      const box = await d.boundingBox();
      assert.equal(Math.round(box.width), width);
      assert.equal(Math.round(box.x), 0);
    }
    await screenshot("picker-" + width);
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Tambah produk", exact: true }),
    ).toBeFocused();
  }
  checks.push(
    "360/390/430/768/1440 layouts without document overflow; mobile picker fills viewport; Escape restores focus",
  );
  const firstPickerResponse = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().startsWith(base),
  );
  await page
    .getByRole("button", { name: "Tambah produk", exact: true })
    .click();
  await firstPickerResponse;
  const retryDialog = page.getByRole("dialog");
  const failedAction = async (route) =>
    route.request().method() === "POST" &&
    route.request().headers()["next-action"]
      ? route.abort("failed")
      : route.continue();
  await page.route(base + "**", failedAction);
  await retryDialog
    .getByRole("textbox", { name: "Cari produk", exact: true })
    .fill(prefix + " no result");
  await expect(retryDialog.getByRole("alert")).toContainText(
    "Koneksi terputus",
  );
  await page.unroute(base + "**", failedAction);
  await retryDialog
    .getByRole("button", { name: "Coba lagi", exact: true })
    .click();
  await expect(
    retryDialog.getByText("Produk tidak ditemukan.", { exact: true }),
  ).toBeVisible();
  await expect(
    retryDialog.getByRole("textbox", { name: "Cari produk", exact: true }),
  ).toHaveValue(prefix + " no result");
  await retryDialog.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(page.locator(".promo-sku-card")).toHaveCount(2);
  checks.push(
    "Failed product request preserves the query and participants; explicit retry recovers without duplicate dialogs",
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(base + "?tab=voucher");
  const more = page.getByRole("button", {
    name: "Tindakan " + code,
    exact: true,
  });
  await more.click();
  await expect(
    page.getByRole("dialog", { name: code, exact: true }),
  ).toBeVisible();
  const actionDialog = page.getByRole("dialog", { name: code, exact: true });
  await expect(
    actionDialog.getByRole("link", { name: "Detail", exact: true }),
  ).toBeVisible();
  await expect(
    actionDialog.getByRole("link", { name: "Edit", exact: true }),
  ).toBeVisible();
  await expect(
    actionDialog.getByRole("button", { name: "Nonaktifkan", exact: true }),
  ).toBeVisible();
  const actionBox = await actionDialog.boundingBox();
  assert(
    actionBox.y > 0 && actionBox.height < 900,
    "Mobile actions use a compact bottom sheet",
  );
  assert(
    await actionDialog.evaluate((el) => el.contains(document.activeElement)),
    "Action dialog receives focus",
  );
  await screenshot("mobile-voucher-actions");
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await page
    .getByRole("button", { name: "Salin kode " + code, exact: true })
    .click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code);
  await more.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Nonaktifkan", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await db.coupon.findUniqueOrThrow({ where: { code } })).isActive,
    )
    .toBe(false);
  await expect(page.locator(".promo-workspace [role=status]")).toContainText(
    "diperbarui",
  );
  await more.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Aktifkan", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await db.coupon.findUniqueOrThrow({ where: { code } })).isActive,
    )
    .toBe(true);
  checks.push(
    "Mobile voucher action sheet exposes Detail/Edit, restores focus, copies code and persists activation changes",
  );
  await page.goto(base + "?tab=flash&view=new&step=1");
  await page.locator("#campaign-name").fill(prefix + " Draf pulih");
  await page.reload();
  await expect(page.locator("#campaign-name")).toHaveValue(
    prefix + " Draf pulih",
  );
  await expect(page.locator(".promo-workspace [role=status]")).toContainText(
    "dipulihkan",
  );
  await page.getByRole("button", { name: "Simpan draf", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Promosi", exact: true }),
  ).toBeVisible();
  const savedDraft = await db.flashSaleCampaign.findFirstOrThrow({
    where: { name: prefix + " Draf pulih" },
  });
  assert.equal(savedDraft.status, "DRAFT");
  assert.equal(savedDraft.draft.startsAt, null);
  checks.push(
    "Reload recovers unsaved fields; incomplete draft is persisted server-side without publication",
  );
  await page.goto(base + "?tab=flash&flash-search=NO_MATCH_" + run);
  await expect(
    page.getByRole("heading", { name: "Tidak ada kampanye yang cocok" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Voucher", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Voucher", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Flash Sale", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Cari kampanye" }),
  ).toHaveValue("NO_MATCH_" + run);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Cari kampanye" }),
  ).toHaveValue("NO_MATCH_" + run);
  checks.push(
    "Search and tab context persist in URL through tab switching and refresh",
  );
  await page.goto(base + "?tab=voucher&view=new");
  const percentCode = code + "P";
  await page.locator("#voucher-code").fill(percentCode);
  await page.locator("#voucher-value").fill("10");
  await page.locator("#voucher-min").fill("100000");
  await page.locator("#voucher-max").fill("20000");
  await page.getByText("Batas penggunaan", { exact: true }).click();
  await page.locator("#voucher-limit").fill("100");
  await page.locator("#voucher-per-customer").fill("1");
  await screenshot("mobile-voucher-form");
  await page.getByRole("button", { name: "Buat voucher", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Promosi", exact: true }),
  ).toBeVisible();
  const percent = await db.coupon.findUniqueOrThrow({
    where: { code: percentCode },
  });
  assert.equal(percent.maxDiscount, 20000);
  assert.equal(percent.perUserLimit, 1);
  assert.equal(percent.usageLimit, 100);
  checks.push(
    "Percentage voucher keeps cap and real total/per-customer limits",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base + "?tab=voucher&view=new");
  const duration = await page
    .locator(".promo-primary")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  assert(duration === "0s");
  checks.push("Reduced motion disables control movement");
  assert.deepEqual(errors, []);
  writeFileSync(
    resolve(out, "result.json"),
    JSON.stringify(
      {
        ok: true,
        run,
        checks,
        errors,
        scope: "isolated local synthetic database; no live campaign",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: true, checks }));
} catch (error) {
  if (page)
    await page
      .screenshot({ path: resolve(out, "failure.png"), fullPage: true })
      .catch(() => {});
  writeFileSync(
    resolve(out, "failure.json"),
    JSON.stringify({ checks, error: String(error), errors }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  if (child) child.kill();
  await db.$disconnect();
}
