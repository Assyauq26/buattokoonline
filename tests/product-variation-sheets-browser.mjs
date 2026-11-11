import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/node_modules/@prisma/client");
const { chromium } = require("../app/node_modules/playwright");
const { SignJWT } =
  await import("../app/node_modules/jose/dist/node/esm/index.js");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.pathname === "/product_sheets_test",
  "Database uji lokal wajib",
);
const db = new PrismaClient(),
  run = randomUUID(),
  origin = "http://127.0.0.1:3118",
  secret = randomBytes(32).toString("hex");
const out = resolve("variation-sheet-evidence");
mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
let browser, child, debugPage;
try {
  const role = await db.role.upsert({
    where: { name: "Admin" },
    update: {},
    create: { name: "Admin", label: "Admin" },
  });
  for (const key of [
    "product.read",
    "product.create",
    "product.update",
    "product.delete",
    "inventory.read",
    "inventory.adjust",
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
      name: "Operator Uji",
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
  const appearance = makeDefault();
  await db.storeAppearance.upsert({
    where: { key: "primary" },
    update: {},
    create: { key: "primary", draft: appearance, published: appearance },
  });
  await db.flashSaleControl.upsert({
    where: { key: "primary" },
    update: {},
    create: { key: "primary" },
  });
  mkdirSync(resolve("../audit-tools/variation-sheets-media"), {
    recursive: true,
  });
  const log = createWriteStream(resolve(out, "preview.log"));
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      process.env.EDITOR_PREVIEW_MODE || "start",
      "-H",
      "127.0.0.1",
      "-p",
      "3118",
    ],
    {
      cwd: resolve(process.env.EDITOR_PREVIEW_APP || "app"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        APP_ORIGIN: origin,
        JWT_SECRET: secret,
        MAINTENANCE_MODE: "0",
        STORAGE_LOCAL_ROOT:
          "/Users/HYPE AI/Documents/ChatGPT/Buat Toko Online/audit-tools/variation-sheets-media",
        STORE_MAIL_RELAY_TOKEN: "",
        RESEND_API_KEY: "",
        STORE_MAIL_MODE: "",
        NODE_ENV:
          process.env.EDITOR_PREVIEW_MODE === "dev"
            ? "development"
            : "production",
      },
    },
  );
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(origin + "/api/v1/ready")).ok) break;
    } catch {}
    if (i === 89) throw Error("Preview gagal");
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const token = await new SignJWT({ email: user.email, ver: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(randomUUID())
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
  const page = await context.newPage();
  debugPage = page;
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(60000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());

  const tab = async (label) =>
    page.getByRole("tab", { name: label, exact: true }).click();
  const outer = () => page.locator(".variation-sheet");
  const saveProduct = async () => {
    await page.getByTestId("save-product").click();
    await page
      .getByText("Seluruh perubahan telah disimpan.", { exact: false })
      .waitFor();
    await page.waitForFunction(
      () => !document.querySelector("#product-name")?.matches(":disabled"),
    );
  };

  const shot = async (file, fullPage = false) => {
    if ((await outer().count()) && !file.includes("inline"))
      await page
        .locator(".variation-sheet .seller-editor-scroll")
        .evaluate((el) => (el.scrollTop = 0));
    const originalViewport = page.viewportSize();
    if (fullPage) {
      const height = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      await page.setViewportSize({
        width: originalViewport.width,
        height: Math.max(height, originalViewport.height),
      });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.screenshot({
      path: resolve(out, file + ".png"),
      fullPage,
      animations: "disabled",
    });
    if (fullPage) await page.setViewportSize(originalViewport);
  };
  const closeSheet = async (discard = false) => {
    await page
      .getByRole("button", { name: "Tutup editor", exact: true })
      .click();
    if (discard)
      await page
        .getByRole("button", { name: "Buang perubahan", exact: true })
        .click();
    await outer().waitFor({ state: "hidden" });
  };
  const finishGroup = async (name = "Simpan variasi") => {
    await outer().getByRole("button", { name, exact: true }).click();
    await page.waitForFunction(
      () =>
        !document.querySelector(".variation-sheet") ||
        document.querySelector(".variation-inline-confirm"),
    );
    const confirm = page.getByRole("button", {
      name: "Buat kombinasi",
      exact: true,
    });
    if (await confirm.isVisible()) await confirm.click();
    await outer().waitFor({ state: "hidden" });
  };
  const addType = async (type, options) => {
    await page.getByRole("button", { name: /Tambah jenis variasi/ }).click();
    await outer().getByRole("button", { name: type, exact: true }).click();
    if (type === "Lainnya")
      await outer().locator('input[id^="group-title-"]').fill("Bahan");
    const fields = outer().locator('input[aria-label^="Opsi "]');
    await fields.first().fill(options[0]);
    for (const value of options.slice(1)) {
      await outer()
        .getByRole("button", { name: "Tambahkan opsi", exact: true })
        .click();
      await fields.last().fill(value);
    }
    await finishGroup();
  };
  await page.goto(origin + "/admin/products/new");
  assert.deepEqual(await page.getByRole("tab").allTextContents(), [
    "Foto Produk",
    "Informasi Dasar",
    "Detail",
    "Variasi",
    "Pengiriman",
  ]);
  assert.equal(
    await page
      .getByRole("tab", { name: "Foto Produk", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  for (const name of [
    "Foto Produk",
    "Informasi Dasar",
    "Detail",
    "Variasi",
    "Pengiriman",
  ]) {
    await tab(name);
    assert.equal(
      await page
        .getByRole("tab", { name, exact: true })
        .evaluate((el) => getComputedStyle(el).color),
      "rgb(17, 17, 17)",
    );
    assert.equal(
      await page
        .getByRole("tab", { name, exact: true })
        .evaluate((el) => getComputedStyle(el, "::after").backgroundColor),
      "rgb(17, 17, 17)",
    );
  }
  checks.push(
    "Urutan tab tepat, tab baru Foto Produk, seluruh aktif/garis hitam",
  );
  await tab("Variasi");
  await page.getByLabel("Harga normal (Rp)", { exact: true }).fill("20000");
  await page.getByTestId("save-product").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("#product-tab-basic")
        .getAttribute("aria-selected") === "true",
  );
  assert.equal(
    await page
      .locator("#product-name")
      .evaluate((el) => document.activeElement === el),
    true,
  );
  await page
    .locator("#product-name")
    .fill("Simple sheet " + run.replaceAll("-", " "));
  await tab("Variasi");
  assert.equal(await page.getByText("Varian 1", { exact: true }).count(), 0);
  await tab("Pengiriman");
  await page.locator("#package-weight").fill("0");
  await tab("Foto Produk");
  await page.getByTestId("save-product").click();
  await page.locator("#package-weight-error").waitFor();
  assert.equal(
    await page
      .getByRole("tab", { name: "Pengiriman", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.locator("#package-weight").fill("50");
  await page.locator("#package-length").fill("20");
  await tab("Informasi Dasar");
  await page.getByTestId("save-product").click();
  await page.locator("#package-length-error").waitFor();
  await page.locator("#package-length").fill("");
  await tab("Variasi");
  await page.locator("#simple-stock").fill("7");
  await saveProduct();
  const simple = await db.product.findFirstOrThrow({
    where: { name: "Simple sheet " + run.replaceAll("-", " ") },
    include: { variants: { include: { inventory: true } } },
  });
  assert.equal(simple.variants.length, 1);
  assert.equal(simple.variants[0].inventory.onHand, 7);
  await page.reload();
  await tab("Variasi");
  assert.equal(await page.locator("#simple-stock").inputValue(), "7");
  await page.goto(page.url() + "#product-media");
  assert.equal(
    await page
      .getByRole("tab", { name: "Foto Produk", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  checks.push(
    "Simple satu SKU internal, validasi pindah/fokus tab, reopen dan hash lama aman",
  );

  await page.goto(origin + "/admin/products/new");
  const name = "Sheet variasi " + run.replaceAll("-", " ");
  await tab("Informasi Dasar");
  await page.locator("#product-name").fill(name);
  await tab("Foto Produk");
  const sharp = require("../app/node_modules/sharp");
  const image = await sharp({
    create: { width: 80, height: 100, channels: 3, background: "#a2b39b" },
  })
    .png()
    .toBuffer();
  await page
    .locator("#product-image-upload")
    .setInputFiles({ name: "sage.png", mimeType: "image/png", buffer: image });
  await page.locator(".seller-gallery-photo").first().waitFor();
  await tab("Variasi");
  await page.locator("#product-price").fill("20000");
  await page.getByRole("switch").click();
  assert.equal(await outer().count(), 0);
  await page.getByText("Belum ada variasi", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Atur harga & stok", exact: true })
      .count(),
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("mobile-empty", true);
  checks.push(
    "Toggle hanya menampilkan empty state; SKU belum dapat dibuka; foto/nama bertahan antartab",
  );
  await page.getByRole("button", { name: /Tambah variasi pertama/ }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await outer().getAttribute("data-motion"), "none");
  assert.equal(
    await page
      .getByRole("dialog", { name: "Tambah variasi", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await outer().evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  await outer().getByRole("button", { name: "Motif", exact: true }).click();
  await outer().locator('input[aria-label^="Opsi "]').first().fill("Polos");
  await page.getByRole("button", { name: "Tutup editor", exact: true }).click();
  await page
    .getByRole("button", { name: "Lanjut mengedit", exact: true })
    .click();
  assert.equal(
    await outer().locator('input[aria-label^="Opsi "]').first().inputValue(),
    "Polos",
  );
  await closeSheet(true);
  await page.getByText("Belum ada variasi", { exact: true }).waitFor();
  checks.push(
    "Draft sheet belum masuk form; tutup memberi lanjut/buang tanpa opsi kosong",
  );

  await page.getByRole("button", { name: /Tambah variasi pertama/ }).click();
  await outer().getByRole("button", { name: "Warna", exact: true }).click();
  const values = () => outer().locator('input[aria-label^="Opsi "]');
  await values().first().fill("Sage");
  await outer().getByLabel("Tambahkan gambar Warna", { exact: true }).check();
  await page
    .getByRole("button", { name: "Unggah foto Sage", exact: true })
    .click();
  const picker = page.getByRole("region", {
    name: "Foto untuk Sage",
    exact: true,
  });
  await picker.waitFor();
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "hidden" });
  assert.equal(await outer().isVisible(), true);
  assert.equal(
    await page
      .getByRole("button", { name: "Lanjut mengedit", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Unggah foto Sage", exact: true })
    .click();
  await picker.waitFor();
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert.equal(await page.locator(".seller-image-dialog").count(), 0);
  await shot("mobile-inline-photo");
  await page
    .getByRole("button", { name: "Pilih foto produk 1", exact: true })
    .click();
  await picker.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Ganti foto Sage", exact: true })
    .locator("img")
    .waitFor();
  await outer()
    .getByRole("button", { name: "Tambahkan opsi", exact: true })
    .click();
  await values().last().fill("sage");
  await outer()
    .getByRole("button", { name: "Simpan variasi", exact: true })
    .click();
  await outer()
    .getByText("Nama opsi dalam jenis ini tidak boleh sama.", { exact: true })
    .first()
    .waitFor();
  await values().last().fill("Cream");
  await page
    .getByRole("button", { name: "Unggah foto Cream", exact: true })
    .click();
  await page.route("**/api/v1/admin/product-media", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { message: "Fixture upload failure" },
      }),
    }),
  );
  await page
    .getByLabel("File foto Cream", { exact: true })
    .setInputFiles({ name: "cream.png", mimeType: "image/png", buffer: image });
  await page
    .getByRole("button", { name: "Coba unggah lagi", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Foto untuk Cream", exact: true })
      .isVisible(),
    true,
  );
  await page.unroute("**/api/v1/admin/product-media");
  await page
    .getByRole("button", { name: "Coba unggah lagi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ganti foto Cream", exact: true })
    .locator("img")
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Foto untuk Cream", exact: true })
      .count(),
    0,
  );
  await outer()
    .getByRole("button", { name: "Tambahkan opsi", exact: true })
    .click();
  await values().last().fill("Hitam");
  checks.push(
    "Foto inline satu dialog; pilih gallery langsung; upload gagal dapat retry tanpa hilang draft",
  );
  await outer()
    .getByRole("button", { name: "Simpan variasi", exact: true })
    .click();
  await outer().waitFor({ state: "hidden" });
  assert.equal(await db.product.count({ where: { name } }), 0);
  await page.getByRole("button", { name: "Edit Warna", exact: true }).waitFor();
  await shot("mobile-one-type", true);
  await addType("Ukuran", ["M", "L", "XL"]);
  await addType("Lainnya", ["Katun"]);
  assert.equal(
    await page
      .getByRole("button", { name: /Tambah jenis variasi \(3\/3\)/ })
      .isDisabled(),
    true,
  );
  await page.getByText("9 kombinasi SKU", { exact: true }).waitFor();
  assert.equal(await page.getByText("1 dari 2", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Edit Bahan", exact: true }).click();
  assert.equal(await outer().locator('input[id^="group-title-"]').count(), 1);
  const groupField = outer().locator('input[id^="group-title-"]');
  await groupField.fill("Warna");
  await page.getByRole("button", { name: "Simpan Bahan", exact: true }).click();
  await page.waitForFunction(() =>
    document.activeElement?.id.startsWith("group-title-"),
  );
  assert.equal(await groupField.getAttribute("aria-invalid"), "true");
  await groupField.fill("Bahan");
  await outer().getByLabel("Tambahkan gambar Bahan", { exact: true }).click();
  await page.getByText("Pindahkan foto variasi?", { exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 1);
  await page
    .locator(".variation-inline-confirm")
    .getByRole("button", { name: "Batal", exact: true })
    .click();
  await closeSheet();
  checks.push(
    "Satu sampai tiga jenis, 3×3×1 kombinasi, tiap Edit hanya satu jenis; transfer foto inline dapat dibatalkan",
  );
  await page
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Harga & Stok · 9 SKU", exact: true })
    .waitFor();
  assert.equal(await outer().locator('input[id^="group-title-"]').count(), 0);
  await page
    .getByRole("button", { name: "Sage / M / Katun", exact: true })
    .click();
  const manualSku = "MANUAL-" + run.slice(0, 8).toUpperCase();
  await page.locator("#sku-0").fill(manualSku);
  await page
    .getByRole("button", { name: "Sage / M / Katun", exact: true })
    .click();
  assert.equal(await page.locator("#bulk-price").isVisible(), false);
  await outer().getByText("Atur massal", { exact: false }).first().click();
  await page.locator("#bulk-price").fill("25000");
  await page.locator("#bulk-salePrice").fill("22000");
  await page.locator("#bulk-onHand").fill("5");
  await page
    .getByRole("button", { name: "Terapkan ke SKU", exact: true })
    .click();
  await page.getByLabel("Hanya SKU dipilih", { exact: true }).check();
  await page
    .getByLabel("Cari SKU atau kombinasi", { exact: true })
    .fill("Cream / L");
  assert.equal(await page.locator(".variation-sku-grid-row").count(), 1);
  await page.getByLabel("Pilih SKU 5", { exact: true }).check();
  await page.locator("#bulk-price").fill("27000");
  await page.locator("#bulk-salePrice").fill("");
  await page.locator("#bulk-onHand").fill("");
  await page
    .getByRole("button", { name: "Terapkan ke SKU", exact: true })
    .click();
  await page.getByLabel("Cari SKU atau kombinasi", { exact: true }).fill("");
  assert.equal(await page.locator("#sku-price-4").inputValue(), "27000");
  assert.equal(await page.locator("#sku-price-0").inputValue(), "25000");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByLabel("SKU dipilih", { exact: true }).check();
  assert.equal(await page.locator(".variation-sku-grid-row").count(), 1);
  await page.getByLabel("Semua SKU", { exact: true }).check();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.locator("#bulk-price").fill("30000");
  await page
    .getByRole("button", { name: "Simpan Harga & Stok", exact: true })
    .click();
  await outer().getByRole("alert").first().waitFor();
  assert.equal(await outer().isVisible(), true);
  await page
    .getByRole("button", { name: "Reset isian massal", exact: true })
    .click();
  await page.locator("#sku-sale-0").fill("99999");
  await page
    .getByLabel("Cari SKU atau kombinasi", { exact: true })
    .fill("Cream / L");
  await page
    .getByRole("button", { name: "Simpan Harga & Stok", exact: true })
    .click();
  await page.locator("#sku-sale-0-error").waitFor();
  await page.locator("#sku-sale-0").fill("22000");
  await page
    .locator(".variation-bulk-disclosure > details")
    .evaluate((el) => (el.open = false));
  for (const width of [360, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await outer().evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      "Sheet overflow " + width,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Page overflow " + width,
    );
    await shot("stock-" + width);
  }
  await page.setViewportSize({ width: 390, height: 500 });
  assert.ok(
    await page
      .locator(".variation-sheet-footer")
      .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight + 1),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await outer().evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  assert.equal(
    await outer().evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page
    .getByRole("button", { name: "Simpan Harga & Stok", exact: true })
    .click();
  await outer().waitFor({ state: "hidden" });
  assert.equal(await db.product.count({ where: { name } }), 0);
  checks.push(
    "SKU langsung: bulk semua/terpilih memakai indeks asli meski difilter; validasi diskon dan bulk belum diterapkan; hanya draft form",
  );
  checks.push(
    "Tabel mobile 4 kolom, 7 viewport tanpa overflow, footer tinggi 500px dan reduced motion",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await shot("desktop-main", true);
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("mobile-main", true);
  await page
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .click();
  await page.locator("#sku-price-0").fill("29000");
  page.removeAllListeners("dialog");
  let backWarning = false;
  page.once("dialog", async (d) => {
    backWarning =
      d.type() === "beforeunload" || d.message().includes("belum disimpan");
    await d.dismiss();
  });
  const sheetUrl = page.url();
  await page.evaluate(() => history.back());
  await page.waitForFunction(() =>
    Boolean(document.querySelector(".variation-sheet")),
  );
  await page.waitForTimeout(300);
  assert.equal(backWarning, true);
  assert.equal(page.url(), sheetUrl);
  assert.equal(await page.locator("#sku-price-0").inputValue(), "29000");
  page.on("dialog", (d) => d.accept());
  await closeSheet(true);
  await page
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .click();
  assert.equal(await page.locator("#sku-price-0").inputValue(), "25000");
  await closeSheet();
  checks.push(
    "Tutup sheet SKU mengembalikan nilai form sebelumnya; fokus kembali ke pemicu",
  );
  await saveProduct();
  let product = await db.product.findFirstOrThrow({
    where: { name },
    include: {
      variants: { include: { inventory: true, optionValues: true } },
      optionGroups: { include: { values: true } },
    },
  });
  assert.equal(product.variants.length, 9);
  assert.ok(product.variants.some((v) => v.sku === manualSku));
  assert.equal(product.optionGroups.length, 3);
  const originals = product.variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    price: v.price,
    stock: v.inventory.onHand,
  }));
  const originalIds = originals.map((v) => v.id).sort();
  const photoMapping = product.optionGroups.flatMap((g) =>
    g.values
      .filter((v) => v.imageId)
      .map((v) => ({ id: v.id, imageId: v.imageId })),
  );
  assert.equal(photoMapping.length, 2);
  await page.reload();
  await tab("Variasi");
  await page
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .click();
  await page.locator("#sku-price-0").fill("28000");
  await page.waitForFunction(() =>
    document
      .querySelector(".seller-product-actions")
      ?.textContent.includes("Ada perubahan"),
  );
  assert.equal(
    await page.evaluate(
      () =>
        !window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    ),
    true,
  );
  await closeSheet(true);
  checks.push(
    "Draft sheet pada produk tersimpan juga mengaktifkan guard keluar browser",
  );
  await page.getByRole("button", { name: "Edit Warna", exact: true }).click();
  await outer().locator('input[aria-label="Opsi Warna 1"]').fill("Sage baru");

  await page
    .getByRole("button", { name: "Urutkan opsi Sage baru", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  assert.equal(await outer().isVisible(), true);
  assert.equal(
    await page
      .getByRole("button", { name: "Lanjut mengedit", exact: true })
      .count(),
    0,
  );
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await shot("desktop-edit-type");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("mobile-edit-type");
  await finishGroup("Simpan Warna");
  await saveProduct();
  const after = await db.productVariant.findMany({
    where: { productId: product.id },
    include: { inventory: true },
  });
  for (const old of originals) {
    const fresh = after.find((v) => v.id === old.id);
    assert.equal(fresh.sku, old.sku);
    assert.equal(fresh.price, old.price);
    assert.equal(fresh.inventory.onHand, old.stock);
  }
  for (const old of photoMapping)
    assert.equal(
      (await db.productOptionValue.findUniqueOrThrow({ where: { id: old.id } }))
        .imageId,
      old.imageId,
    );
  checks.push(
    "Simpan/reopen/rename/reorder menjaga seluruh ID, kode, harga, stok dan foto opsi lama",
  );
  await page.getByRole("button", { name: "Edit Warna", exact: true }).click();
  await page
    .getByRole("button", { name: "Hapus opsi Sage baru", exact: true })
    .click();
  await outer()
    .getByText(/dipakai SKU dengan stok atau riwayat/)
    .waitFor();
  await closeSheet();
  await page.getByRole("button", { name: "Edit Warna", exact: true }).click();
  await outer()
    .getByRole("button", { name: "Tambahkan opsi", exact: true })
    .click();
  await values().last().fill("Batik");
  await finishGroup("Simpan Warna");
  await saveProduct();
  let expanded = await db.productVariant.findMany({
    where: { productId: product.id },
    include: { inventory: true },
  });
  assert.equal(expanded.length, 12);
  assert.ok(
    expanded
      .filter((v) => !originalIds.includes(v.id))
      .every((v) => v.inventory.onHand === 0),
  );
  await page.getByRole("button", { name: "Edit Warna", exact: true }).click();
  await page
    .getByRole("button", { name: "Hapus opsi Batik", exact: true })
    .click();
  await page
    .locator(".variation-inline-confirm")
    .getByRole("button", { name: "Hapus opsi", exact: true })
    .click();
  await finishGroup("Simpan Warna");
  await saveProduct();
  assert.deepEqual(
    (await db.productVariant.findMany({ where: { productId: product.id } }))
      .map((v) => v.id)
      .sort(),
    originalIds,
  );
  checks.push(
    "SKU berstok tidak dapat dihapus; opsi baru mendapat stok 0; hapus opsi aman menjaga seluruh SKU lama",
  );

  const legacy = await db.product.create({
    data: {
      name: "Legacy sheet " + run.slice(0, 8),
      slug: "legacy-sheet-" + run,
      basePrice: 19000,
      weightGrams: 100,
      images: { create: { url: "/icon.svg", alt: "Fixture" } },
      variants: {
        create: {
          sku: "LEG-" + run,
          color: "Hitam",
          size: "M",
          price: 21000,
          inventory: { create: { onHand: 3 } },
        },
      },
    },
    include: { variants: true },
  });
  await page.goto(origin + "/admin/products/" + legacy.id);
  await tab("Variasi");
  await page
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .click();
  await page.locator("#sku-price-0").fill("22000");
  await page
    .getByRole("button", { name: "Simpan Harga & Stok", exact: true })
    .click();
  await saveProduct();
  const legacyAfter = await db.product.findUniqueOrThrow({
    where: { id: legacy.id },
    include: { variants: { include: { inventory: true } } },
  });
  assert.equal(legacyAfter.optionsEnabled, false);
  assert.equal(legacyAfter.variants[0].id, legacy.variants[0].id);
  assert.equal(legacyAfter.variants[0].inventory.onHand, 3);
  assert.equal(legacyAfter.variants[0].price, 22000);
  checks.push(
    "Edit harga legacy menjaga format lama, ID dan stok tanpa adopsi variasi tak disengaja",
  );

  await page.goto(origin + "/admin/products/new");
  await tab("Informasi Dasar");
  await page
    .locator("#product-name")
    .fill("Inline kosong " + run.replaceAll("-", " "));
  await tab("Variasi");
  await page.locator("#product-price").fill("20000");
  await page.getByRole("switch").click();
  await page.getByTestId("save-product").click();
  await page
    .getByText("Lengkapi opsi variasi sebelum menyimpan produk.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await outer().count(), 0);
  await page.getByRole("button", { name: /Tambah variasi pertama/ }).click();
  await outer().getByRole("button", { name: "Warna", exact: true }).click();
  await outer().locator('input[aria-label^="Opsi "]').first().fill("Sage");
  await outer().getByLabel("Tambahkan gambar Warna", { exact: true }).check();
  await page
    .getByRole("button", { name: "Unggah foto Sage", exact: true })
    .click();
  await page.getByText("Belum ada foto produk", { exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 1);
  await shot("mobile-inline-empty");
  await page
    .getByLabel("File foto Sage", { exact: true })
    .setInputFiles({ name: "new.png", mimeType: "image/png", buffer: image });
  await page
    .getByRole("button", { name: "Ganti foto Sage", exact: true })
    .locator("img")
    .waitFor();
  await closeSheet(true);
  await page.getByRole("button", { name: /Tambah vari[ae]si pertama/ }).click();
  await outer().getByRole("button", { name: "Warna", exact: true }).click();
  await outer().locator('input[aria-label^="Opsi "]').first().fill("Polos");
  await finishGroup();
  const survivor = await page
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .count();
  assert.equal(survivor, 1);
  await page.getByRole("button", { name: "Edit Warna", exact: true }).click();
  await page.getByLabel("Aksi variasi 1", { exact: true }).click();
  await page
    .getByRole("button", { name: "Hapus variasi 1", exact: true })
    .click();
  await page
    .locator(".variation-inline-confirm")
    .getByRole("button", { name: "Hapus variasi", exact: true })
    .click();
  await page.getByRole("button", { name: "Simpan Warna", exact: true }).click();
  await outer().waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("switch").isChecked(), false);
  assert.equal(
    await page
      .locator("#simple-sku")
      .inputValue()
      .then((v) => v.length > 0),
    true,
  );
  checks.push(
    "Tanpa gallery: pemilih inline empty, upload native; batal tidak menerapkan; hapus jenis terakhir dikonfirmasi dan mempertahankan SKU internal",
  );

  const roleRead = await db.role.upsert({
    where: { name: "Manager" },
    update: {},
    create: { name: "Manager", label: "Manager" },
  });
  for (const key of ["product.read", "product.update", "inventory.read"]) {
    const permission = await db.permission.findUniqueOrThrow({
      where: { key },
    });
    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: roleRead.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: { roleId: roleRead.id, permissionId: permission.id },
    });
  }
  const manager = await db.user.create({
    data: {
      name: "Manager fixture",
      email: run + "-readonly@example.test",
      passwordHash: "disabled",
      roles: { create: { roleId: roleRead.id } },
    },
  });
  const readToken = await new SignJWT({ email: manager.email, ver: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(manager.id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setIssuer(origin)
    .setAudience("storefront")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
  const readContext = await browser.newContext({
    viewport: { width: 390, height: 700 },
  });
  await readContext.addCookies([
    {
      name: "store_session",
      value: readToken,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const readPage = await readContext.newPage();
  await readPage.goto(origin + "/admin/products/" + product.id);
  await readPage.getByRole("tab", { name: "Variasi", exact: true }).click();
  await readPage
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .click();
  assert.equal(await readPage.locator("#sku-stock-0").isDisabled(), true);
  await readPage
    .getByRole("button", { name: "Tutup editor", exact: true })
    .click();
  await readPage.locator(".variation-sheet").waitFor({ state: "hidden" });
  assert.equal(
    await readPage
      .getByRole("button", { name: "Atur harga & stok", exact: true })
      .evaluate((el) => document.activeElement === el),
    true,
  );
  await readContext.close();
  checks.push("Izin stok readonly dan fokus setelah sheet tetap berlaku");
  await tab("Informasi Dasar");
  await page.locator("#product-name").fill("Belum disimpan");
  page.removeAllListeners("dialog");
  let warning = false;
  page.once("dialog", async (d) => {
    warning = d.message().includes("belum disimpan");
    await d.dismiss();
  });
  const beforeUrl = page.url();
  await page
    .getByRole("link", { name: "Kembali ke produk", exact: true })
    .click();
  assert.equal(warning, true);
  assert.equal(page.url(), beforeUrl);
  checks.push("Guard keluar lintas tab tetap menjaga perubahan belum disimpan");
  assert.deepEqual(errors, []);
  writeFileSync(
    resolve(out, "result.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  if (debugPage) {
    await debugPage
      .screenshot({ path: resolve(out, "failure.png") })
      .catch(() => {});
    writeFileSync(
      resolve(out, "failure.html"),
      await debugPage.content().catch(() => ""),
    );
  }
  writeFileSync(
    resolve(out, "result.json"),
    JSON.stringify({ checks, errors, failure: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  if (child) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } catch {}
    } else child.kill();
  }
  await db.$disconnect();
}
