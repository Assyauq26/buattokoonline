import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID, createCipheriv } from "node:crypto";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { PrismaClient } = require("../app/node_modules/@prisma/client"),
  { chromium, expect } = require("../app/node_modules/@playwright/test"),
  bcrypt = require("../app/node_modules/bcryptjs");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert(
  ["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.pathname === "/management_v130_test",
  "Disposable local DB only",
);
const db = new PrismaClient(),
  run = randomUUID(),
  out = resolve("output/settings-audit"),
  origin = "http://127.0.0.1:3104",
  checks = [],
  errors = [];
mkdirSync(out, { recursive: true });
let child, browser, page;
const secret = randomBytes(32),
  key = randomBytes(32),
  password = randomBytes(20).toString("hex");
const credential = "synthetic-unused-" + run;
try {
  const { ALL_PERMISSIONS } =
    require("../app/node_modules/tsx/dist/cjs/api/index.cjs").require(
      "../app/src/lib/auth/permissions.ts",
      import.meta.url,
    );
  const role = await db.role.upsert({
    where: { name: "Admin" },
    update: {},
    create: { name: "Admin", label: "Admin" },
  });
  for (const name of ALL_PERMISSIONS) {
    const p = await db.permission.upsert({
      where: { key: name },
      update: {},
      create: { key: name, label: name },
    });
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
      update: {},
      create: { roleId: role.id, permissionId: p.id },
    });
  }
  const user = await db.user.create({
    data: {
      name: "Operator Demo",
      email: run + "@example.test",
      passwordHash: await bcrypt.hash(password, 10),
      phone: "+628" + Date.now().toString().slice(-10),
      roles: { create: { roleId: role.id } },
      emailVerifiedAt: new Date(),
    },
  });
  const { makeDefault } =
    require("../app/node_modules/tsx/dist/cjs/api/index.cjs").require(
      "../app/src/modules/appearance/schema.ts",
      import.meta.url,
    );
  const theme = makeDefault();
  theme.identity = {
    ...theme.identity,
    name: "Gheverhan",
    description: "Toko online resmi Gheverhan.",
    operationalAddress: "Jl. Mawar No. 8, Batang, Jawa Tengah.",
    whatsapp: "6282211700060",
    showWhatsApp: true,
    serviceHours: "Senin–Sabtu, 08.00–17.00 WIB",
  };
  theme.colors.primary = "#243C63";
  theme.colors.primaryText = "#FFFFFF";
  theme.colors.primaryHover = "#1E3355";
  theme.colors.primaryPressed = "#182947";
  const version =
    (await db.storeAppearanceRevision.aggregate({ _max: { version: true } }))
      ._max.version + 100;
  await db.storeAppearance.upsert({
    where: { key: "primary" },
    update: {
      draft: theme,
      published: theme,
      draftVersion: version,
      publishedVersion: version,
    },
    create: {
      key: "primary",
      draft: theme,
      published: theme,
      draftVersion: version,
      publishedVersion: version,
    },
  });
  await db.bankAccount.updateMany({
    where: { deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  });
  await db.bankAccount.create({
    data: {
      bankName: "BCA",
      accountNumber: "00123456789",
      accountHolder: "Operator Demo",
      displayName: "Pembayaran toko",
    },
  });
  await db.shippingSettings.upsert({
    where: { id: 1 },
    update: { manualFlat: 7000, activeJntId: null },
    create: { id: 1, manualFlat: 7000 },
  });
  await db.jntIntegration.deleteMany({});
  const config = {
    endpoints: {
      order:
        "https://demo-ecommerce.inuat-jntexpress.id/jts-idn-ecommerce-api/api/order/create",
      cancellation:
        "https://demo-ecommerce.inuat-jntexpress.id/jts-idn-ecommerce-api/api/order/cancel",
      tariff:
        "https://demo-general.inuat-jntexpress.id/jandt_track/inquiry.action",
      tracking:
        "https://demo-general.inuat-jntexpress.id/jandt_track/track/trackAction!tracking.action",
    },
    credentials: Object.fromEntries(
      [
        "orderUsername",
        "orderApiKey",
        "orderKey",
        "tariffCustomer",
        "tariffKey",
        "trackingUsername",
        "trackingPassword",
      ].map((k) => [k, credential]),
    ),
    sharedCancellation: true,
    seller: {
      warehouse: {
        name: "Gudang Demo",
        contact: "Operator",
        phone: "+6281234567890",
        address: "Gudang Batang Jawa Tengah",
        originSite: "BATANG",
        originCityCode: "BGG",
      },
      services: [],
      selectedServices: ["EZ", "JND"],
    },
  };
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from("single-store:jnt:v2:sandbox"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(config)),
    cipher.final(),
  ]);
  await db.jntIntegration.create({
    data: {
      environment: "sandbox",
      encryptedConfig: [
        "v2",
        nonce.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        encrypted.toString("base64"),
      ].join(":"),
      updatedBy: user.id,
    },
  });
  await db.flashSaleControl.upsert({
    where: { key: "primary" },
    update: {},
    create: { key: "primary" },
  });
  const media = resolve(out, "media")
    .replace(/\\/g, "/")
    .replace(/^[A-Za-z]:/, "");
  mkdirSync(media, { recursive: true });
  const log = createWriteStream(resolve(out, "preview.log"));
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      process.env.SETTINGS_DEBUG ? "dev" : "start",
      "-H",
      "127.0.0.1",
      "-p",
      "3104",
    ],
    {
      cwd: resolve("app"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        APP_ORIGIN: origin,
        STORAGE_LOCAL_ROOT: media,
        JWT_SECRET: secret.toString("hex"),
        JNT_API_ENV: "sandbox",
        JNT_INTEGRATION_ENCRYPTION_KEY: key.toString("base64"),
        ORDER_DATA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
        STORE_INSTALLED_VERSION: "1.6.3",
        STORE_UPDATE_CHANNEL: "stable",
        STORE_MAIL_MODE: "",
        RESEND_API_KEY: "",
        STORE_MAIL_RELAY_TOKEN: "",
        MAINTENANCE_MODE: "0",
        NODE_ENV: process.env.SETTINGS_DEBUG ? "development" : "production",
      },
    },
  );
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(origin + "/api/v1/ready")).ok) break;
    } catch {}
    if (i === 89) throw Error("Preview failed");
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Los_Angeles",
  });
  const login = async (c) => {
    const r = await c.request.post(origin + "/api/v1/auth/login", {
      headers: { Origin: origin },
      data: { identifier: user.email, password },
    });
    assert.equal(r.status(), 200);
  };
  await login(context);
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const go = async (path) => {
    await page.goto(origin + path);
    await page.locator(".settings-content").waitFor();
  };
  const check = (s) => {
    checks.push(s);
    console.log("PASS", s);
  };
  const snap = async (name) => {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: resolve(out, name + ".png"),
      fullPage: true,
    });
    if (page.viewportSize().width < 768)
      await page.screenshot({ path: resolve(out, name + "-viewport.png") });
  };
  await go("/admin/settings");
  await expect(page).toHaveURL(/settings\/seller$/);
  await expect(page.locator(".settings-content h1")).toHaveText(
    "Informasi Seller",
  );
  check("Base route redirects directly to seller");
  const phone = page.getByLabel("Nomor HP", { exact: true });
  await phone.fill("");
  await phone.pressSequentially("081234567890");
  let save = page.getByRole("button", { name: "Simpan profil" });
  await save.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Profil seller tersimpan." }),
  ).toBeVisible();
  await expect(phone).toHaveValue("+6281234567890");
  await page.reload();
  await expect(phone).toHaveValue("+6281234567890");
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).phone,
    user.phone,
  );
  check(
    "Phone typing, normalization, persistence and login identity separation",
  );
  await phone.fill("123");
  await save.click();
  await expect(page.locator("#seller-phone-error")).toContainText(
    "Nomor HP valid",
  );
  await expect(phone).toHaveValue("123");
  await phone.fill("");
  await save.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Profil seller tersimpan." }),
  ).toBeVisible();
  await page.reload();
  await expect(phone).toHaveValue("");
  await login(context);
  await page.reload();
  await expect(phone).toHaveValue("");
  check(
    "Invalid contact stays editable; cleared phone persists after new login",
  );
  await snap("seller-desktop");
  const nav = page.getByRole("navigation", {
    name: "Navigasi admin",
    exact: true,
  });
  const product = nav.getByRole("button", { name: "Produk", exact: true }),
    orders = nav.getByRole("button", { name: "Pesanan", exact: true });
  const xs = await Promise.all(
    [product, orders].map((l) => l.locator(".admin-nav-chevron").boundingBox()),
  );
  assert.equal(xs[0].x, xs[1].x);
  await product.focus();
  await page.keyboard.press("Enter");
  await expect(product).toHaveAttribute("aria-expanded", "true");
  assert.equal(
    await product.evaluate((e) => e.parentElement.dataset.animate),
    "false",
  );
  await product.click();
  await product.click();
  await expect(product).toHaveAttribute("aria-expanded", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await product
      .locator("svg")
      .last()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(origin + "/admin/products/categories");
  await expect(product).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  await expect(product).toHaveAttribute("aria-expanded", "true");
  check(
    "Aligned disclosure, keyboard, quick reversal, reduced motion, active deep link",
  );

  await go("/admin/settings/store");
  const address = page.getByLabel("Alamat operasional", { exact: true });
  await address.fill("Jl. Melati No. 10, Batang");
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await expect(address).toHaveValue(theme.identity.operationalAddress);
  await address.fill("Jl. Melati No. 10, Batang");
  // Failed save must retain draft.
  let releaseSave,
    saveRequests = 0;
  const saveGate = new Promise((resolve) => {
    releaseSave = resolve;
  });
  await page.route(
    "**/api/v1/admin/store-information",
    async (route) => {
      saveRequests++;
      await saveGate;
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Konflik uji, perubahan belum tersimpan." },
        }),
      });
    },
    { times: 1 },
  );
  const storeSave = page.locator(
    '.store-settings-form button[type="submit"],.store-settings-form .settings-save button:not([type])',
  );
  const sizeBefore = await storeSave.boundingBox();
  await storeSave.click();
  await expect(storeSave).toBeDisabled();
  await expect(storeSave).toContainText("Menyimpan");
  const sizeDuring = await storeSave.boundingBox();
  assert.equal(sizeBefore.width, sizeDuring.width);
  assert.equal(sizeBefore.height, sizeDuring.height);
  await page
    .locator(".store-settings-form")
    .evaluate((form) =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await expect.poll(() => saveRequests).toBe(1);
  releaseSave();
  check(
    "Immediate save spinner, stable button size and duplicate submission lock",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Konflik uji" }),
  ).toBeVisible();
  await expect(address).toHaveValue("Jl. Melati No. 10, Batang");
  await page
    .getByRole("button", { name: "Simpan perubahan", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "tersimpan dan diterbitkan" }),
  ).toBeVisible();
  await page.reload();
  await expect(address).toHaveValue("Jl. Melati No. 10, Batang");
  const publicText = await page.evaluate(
    async () =>
      await (
        await fetch("/api/v1/admin/integrations/jnt?environment=sandbox")
      ).text(),
  );
  assert(!publicText.includes(credential));
  assert.equal(
    JSON.parse(publicText).data.seller.warehouse.address,
    config.seller.warehouse.address,
  );
  check(
    "Store save/cancel/error draft retention, warehouse isolated, credentials not exposed",
  );
  await snap("store-desktop");

  await go("/admin/settings/bank-accounts");
  assert(
    !(await page.locator(".settings-bank-list").innerText()).includes(
      "00123456789",
    ),
  );
  await page
    .locator(".settings-bank-row")
    .first()
    .getByRole("button", { name: "Ubah", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ubah rekening" }),
  ).toBeVisible();
  await expect(page.locator('[name="accountNumber"]')).toHaveValue(
    "00123456789",
  );
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.locator('[name="accountNumber"]').fill("000111222333");
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal(
    await db.bankAccount.count({
      where: { accountNumber: "000111222333", deletedAt: null },
    }),
    0,
  );
  await page.locator('[name="bankName"]').fill("BRI");
  await page.locator('[name="accountNumber"]').fill("000123456789012");
  await page.locator('[name="accountHolder"]').fill("Operator Demo");
  await page.locator('[name="displayName"]').fill("Bank tambahan");
  await page.getByTestId("bank-submit").click();
  await expect(
    page.getByRole("status").filter({ hasText: "Rekening ditambahkan." }),
  ).toBeVisible();
  const row = page.locator(".settings-bank-row").filter({ hasText: "BRI" });
  await row.getByRole("button", { name: "Ubah", exact: true }).click();
  await page.locator('[name="accountHolder"]').fill("Pemilik Baru");
  await page.getByTestId("bank-submit").click();
  await expect(
    page.getByRole("status").filter({ hasText: "Rekening diperbarui." }),
  ).toBeVisible();
  await expect(row).toContainText("Pemilik Baru");
  await row.getByRole("button", { name: "Nonaktifkan", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Aktifkan", exact: true }),
  ).toBeVisible();
  check(
    "Inline bank create/edit/cancel, masked summaries, leading zeros, real status save",
  );
  await snap("bank-desktop");
  await go("/admin/settings/payment-methods");
  await expect(page.locator(".settings-content")).toContainText(
    "1 rekening aktif",
  );
  check("Payment status reflects active bank accounts");
  await snap("payment-desktop");

  await go("/admin/settings/shipping");
  await page.getByLabel("Tarif per pesanan (Rp)").fill("9000");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Tarif tersimpan" }),
  ).toBeVisible();
  assert.equal(
    (await db.shippingSettings.findUniqueOrThrow({ where: { id: 1 } }))
      .activeJntId,
    null,
  );
  await page.getByRole("radio", { name: "API J&T Express" }).check();
  await page.getByLabel("Environment", { exact: true }).selectOption("sandbox");
  await snap("shipping-desktop");
  await page.getByRole("link", { name: "Kelola konfigurasi" }).click();
  await page.getByRole("button", { name: "Simpan Konfigurasi" }).waitFor();
  await expect(page.getByLabel("order Key", { exact: true })).toHaveValue("");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "settings-mapping.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Provinsi,Kota,Kecamatan,sendSiteCode,origin_code,destAreaCode,destination_code,receiver_area\nJAWA TENGAH,KAB. BATANG,WARUNGASEM,BATANG,BGG,WARUNGASEM,BGG,BGG001\n",
      ),
    });
  await expect(
    page.getByRole("status").filter({ hasText: "Mapping berhasil" }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByLabel("Provinsi", { exact: true })
    .selectOption({ label: "JAWA TENGAH" });
  await page
    .getByLabel("Kota/Kabupaten", { exact: true })
    .selectOption({ label: "KAB. BATANG" });
  await page
    .getByLabel("Kecamatan", { exact: true })
    .selectOption({ label: "WARUNGASEM" });
  await page.getByRole("switch", { name: "Aktifkan J&T Express" }).click();
  await page.getByRole("button", { name: "Simpan Konfigurasi" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Konfigurasi tersimpan." }),
  ).toBeVisible();
  const saved = await db.shippingSettings.findUniqueOrThrow({
    where: { id: 1 },
    include: { activeJnt: true },
  });
  assert.equal(saved.activeJnt.environment, "sandbox");
  check(
    "Real mapping import, warehouse selection, blank credentials preserved, J&T activation keeps one checkout method",
  );
  await page.locator("summary").filter({ hasText: "Tracking" }).click();
  await page.locator("summary").filter({ hasText: "Cancellation" }).click();
  await expect(page.getByText("Gunakan kredensial Order")).toBeVisible();
  let probes = 0;
  await page.route("**/api/v1/admin/integrations/jnt/test", (route) => {
    probes++;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          message: "Koneksi HTTP diperiksa (simulasi).",
          results: ["order", "tariff", "tracking", "cancellation"].map(
            (endpoint) => ({ endpoint, message: "HTTP 200 (simulasi)" }),
          ),
        },
      }),
    });
  });
  await page.getByRole("button", { name: "Test API", exact: true }).click();
  await expect(
    page.getByText("Order · HTTP 200 (simulasi)", { exact: true }),
  ).toBeVisible();
  assert.equal(probes, 1);
  await expect(page.getByText(/bukan bukti kredensial/)).toBeVisible();
  check("Four-endpoint probe presentation mocked; no real shipment operation");
  await snap("jnt-desktop");
  await go("/admin/settings/shipping/print");
  await page.getByLabel("Ukuran kertas").selectOption("75x150");
  await page.getByRole("button", { name: "Simpan preferensi" }).click();
  await page.reload();
  await expect(page.getByLabel("Ukuran kertas")).toHaveValue("75x150");
  check("Supported AWB size persists on device");

  await go("/admin/settings/updates");
  await expect(
    page.getByRole("status").filter({ hasText: "Belum diperiksa." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cek Update" }).click();
  await expect(page).toHaveURL(/check=1/);
  await expect(page.getByRole("button", { name: "Cek Update" })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator(".settings-content")).toContainText(
    "status pemasangan tidak dipantau",
  );
  check(
    "Update check stays in settings and does not claim installation success",
  );
  await snap("updates-desktop");
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [slug, title] of [
      ["seller", "Informasi Seller"],
      ["store", "Informasi Toko"],
      ["shipping", "Pengiriman"],
      ["bank-accounts", "Rekening Bank"],
      ["payment-methods", "Metode Pembayaran"],
      ["updates", "Update Versi"],
      ["email-otp", "Email & OTP"],
      ["security", "Keamanan Akun"],
      ["audit", "Audit Log"],
    ]) {
      await go("/admin/settings/" + slug);
      await expect(page.getByLabel("Halaman pengaturan")).toHaveValue(slug);
      const top = await page.getByLabel("Halaman pengaturan").boundingBox(),
        heading = await page
          .locator(".settings-content h1")
          .first()
          .boundingBox();
      assert(
        top.y + top.height <= heading.y + 1,
        "Mobile selector before title " + slug,
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "No overflow " + width + " " + slug,
      );
      if (slug === "store") {
        await page.getByText("Pratinjau Chat Toko", { exact: true }).click();
        await expect(
          page.getByText("Nomor tujuan", { exact: true }),
        ).toBeVisible();
      }
      await snap(slug + "-" + width);
      const lastSave = page
        .locator(".settings-content button.setting-primary")
        .last();
      if (await lastSave.count()) {
        await lastSave.scrollIntoViewIfNeeded();
        await page.evaluate(() =>
          scrollTo(0, document.documentElement.scrollHeight),
        );
        const box = await lastSave.boundingBox(),
          bottom = await page
            .getByRole("navigation", {
              name: "Navigasi bawah admin",
              exact: true,
            })
            .boundingBox();
        assert(
          box.y + box.height <= bottom.y,
          "Save button clear of bottom navigation " + slug + " " + width,
        );
        await page.screenshot({
          path: resolve(out, slug + "-" + width + "-save.png"),
        });
      }
    }
    check("All settings navigation and responsive layout at " + width + "px");
  }
  await go("/admin/settings/seller");
  await page.getByLabel("Halaman pengaturan").selectOption("store");
  await expect(page).toHaveURL(/settings\/store$/);
  await page.goBack();
  await expect(page.getByLabel("Halaman pengaturan")).toHaveValue("seller");
  await page.goForward();
  await expect(page.getByLabel("Halaman pengaturan")).toHaveValue("store");
  check("Mobile selector sync and browser back/forward");
  assert.deepEqual(errors, []);
  check("No browser runtime or hydration errors");
  writeFileSync(
    resolve(out, "results.json"),
    JSON.stringify(
      {
        checks,
        errors,
        external: "Carrier probe mocked; no shipments/emails/updates",
        production: "untouched",
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (page)
    await page
      .screenshot({ path: resolve(out, "failure.png"), fullPage: true })
      .catch(() => {});
  writeFileSync(
    resolve(out, "results.json"),
    JSON.stringify({ checks, errors, failure: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  child?.kill();
  await db.$disconnect();
}
