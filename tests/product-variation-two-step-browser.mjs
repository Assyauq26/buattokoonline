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
    url.pathname === "/product_variation_test",
  "Database uji lokal wajib",
);
const db = new PrismaClient(),
  run = randomUUID(),
  origin = "http://127.0.0.1:3117",
  secret = randomBytes(32).toString("hex");
const out = resolve("variation-two-step-evidence");
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
  mkdirSync(resolve("../audit-tools/variation-two-step-media"), {
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
      "3117",
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
          "/Users/HYPE AI/Documents/ChatGPT/Buat Toko Online/audit-tools/variation-two-step-media",
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
  const outer = () => page.locator(".two-step-dialog");
  const saveProduct = async () => {
    await page.getByTestId("save-product").click();
    await page
      .getByText("Seluruh perubahan telah disimpan.", { exact: false })
      .waitFor();
    await page.waitForFunction(
      () => !document.querySelector("#product-name")?.matches(":disabled"),
    );
  };
  await page.goto(origin + "/admin/products/new");
  await page.getByLabel("Nama produk", { exact: false }).waitFor();
  await page
    .getByLabel("Nama produk", { exact: false })
    .fill("Simple " + run.slice(0, 8));
  await tab("Harga & Variasi");
  assert.equal(await page.getByRole("switch").isChecked(), false);
  assert.equal(await page.getByText("Varian 1", { exact: true }).count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Atur variasi", exact: true })
      .count(),
    0,
  );
  await page.getByLabel("Harga normal (Rp)", { exact: true }).fill("20000");
  await page.getByLabel("Harga diskon (opsional)").fill("15000");
  await page.getByLabel("Stok fisik", { exact: true }).fill("7");
  await saveProduct();
  let simple = await db.product.findFirstOrThrow({
    where: { name: "Simple " + run.slice(0, 8) },
    include: { variants: { include: { inventory: true } } },
  });
  assert.equal(simple.variants.length, 1);
  assert.equal(simple.variants[0].inventory.onHand, 7);
  checks.push(
    "Simple: satu SKU internal, harga/diskon/stok tersimpan tanpa Varian 1",
  );
  await page.reload();
  await tab("Harga & Variasi");
  assert.equal(await page.locator("#simple-stock").inputValue(), "7");
  assert.equal(await page.locator("#product-price").inputValue(), "20000");
  checks.push("Simple reopen mempertahankan data");
  await page.goto(origin + "/admin/products/new");
  const name = "Variasi " + run.slice(0, 8);
  await page.getByLabel("Nama produk", { exact: false }).fill(name);
  await tab("Media");
  const sharp = require("../app/node_modules/sharp");
  const image = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#a8b8cc" },
  })
    .png()
    .toBuffer();
  await page.locator("#product-image-upload").setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: image,
  });
  await page.locator(".seller-gallery-photo").first().waitFor();
  await tab("Harga & Variasi");
  await page.getByLabel("Harga normal (Rp)", { exact: true }).fill("20000");
  await page.getByRole("switch").click();
  await outer().waitFor();
  await page.getByRole("button", { name: "Tambah variasi pertama" }).click();
  await page.getByLabel("Nama variasi 1", { exact: true }).fill("Motif");
  await page.getByLabel("Opsi Motif 1", { exact: true }).fill("Polos");
  await page
    .getByRole("button", { name: /Tambahkan opsi/ })
    .first()
    .click();
  await page.getByLabel("Opsi Motif 2", { exact: true }).fill("Garis");
  await page.getByLabel("Tambahkan gambar Motif", { exact: true }).check();
  await page
    .getByRole("button", { name: "Unggah foto Polos", exact: true })
    .click();
  const picker = page.getByRole("dialog", { name: "Pilih gambar variasi" });
  await picker.waitFor();
  await page.getByRole("button", { name: "Pilih foto 1", exact: true }).click();
  await picker
    .getByRole("button", { name: "Gunakan gambar", exact: true })
    .click();
  await picker.waitFor({ state: "hidden" });
  // Uploading stages media; Batal must retain the option's previous selection.
  const originalPhoto = await page
    .getByRole("button", { name: "Ganti foto Polos", exact: true })
    .locator("img")
    .getAttribute("src");
  await page
    .getByRole("button", { name: "Ganti foto Polos", exact: true })
    .click();
  await picker.waitFor();
  await page.locator("[data-upload-id]").first().setInputFiles({
    name: "option.png",
    mimeType: "image/png",
    buffer: image,
  });
  await picker
    .getByRole("button", { name: "Pilih foto variasi 1", exact: true })
    .waitFor();
  await picker.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Ganti foto Polos", exact: true })
      .locator("img")
      .getAttribute("src"),
    originalPhoto,
  );
  checks.push(
    "Foto opsi dari media draft; upload lalu Batal tidak mengganti mapping",
  );
  await page.getByRole("button", { name: "Urutkan opsi", exact: true }).click();
  const grip = page.getByRole("button", {
    name: "Urutkan opsi Polos",
    exact: true,
  });
  await grip.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Selesai mengurutkan", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Opsi Motif 1", { exact: true }).inputValue(),
    "Garis",
  );
  checks.push("Urutkan opsi melalui keyboard memakai ID, bukan indeks");
  await page.getByRole("button", { name: "Urutkan opsi", exact: true }).click();
  await page
    .getByRole("button", { name: "Urutkan opsi Polos", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Selesai mengurutkan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tambah variasi (1/3)", exact: true })
    .click();
  await page.getByLabel("Nama variasi 2", { exact: true }).fill("Ukuran");
  await page.getByLabel("Opsi Ukuran 1", { exact: true }).fill("S");
  await page
    .getByRole("button", { name: /Tambahkan opsi/ })
    .nth(1)
    .click();
  await page.getByLabel("Opsi Ukuran 2", { exact: true }).fill("M");
  await page
    .getByRole("button", { name: "Tambah variasi (2/3)", exact: true })
    .click();
  await page.getByLabel("Nama variasi 3", { exact: true }).fill("Bahan");
  await page.getByLabel("Opsi Bahan 1", { exact: true }).fill("Katun");
  assert.equal(
    await page
      .getByRole("button", { name: "Tambah variasi (3/3)", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByLabel("Tambahkan gambar Ukuran", { exact: true }).click();
  const transfer = page.getByRole("dialog", {
    name: "Pindahkan foto variasi?",
  });
  await transfer.waitFor();
  await transfer.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("Tambahkan gambar Motif", { exact: true })
      .isChecked(),
    true,
  );
  assert.equal(
    await page
      .getByLabel("Tambahkan gambar Ukuran", { exact: true })
      .isChecked(),
    false,
  );
  checks.push(
    "Foto tetap hanya satu jenis; batal transfer tidak melepas mapping",
  );
  await page.locator(".seller-editor-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: resolve(out, "desktop-options.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(out, "mobile-options.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Lanjut ke Harga & Stok", exact: true })
    .click();
  await page.locator("#sku-0").waitFor();
  assert.equal(await page.locator(".variation-sku").count(), 4);
  checks.push("Tiga jenis opsi membentuk 2×2×1 SKU");
  await page.locator("#bulk-price").fill("25000");
  await page.locator("#bulk-salePrice").fill("22000");
  await page.locator("#bulk-onHand").fill("5");
  await page
    .getByRole("button", { name: "Terapkan ke SKU", exact: true })
    .click();
  await page.getByText(/4 SKU diperbarui/).waitFor();
  await page.getByLabel("Hanya SKU dipilih", { exact: true }).check();
  await page.getByLabel("Pilih SKU 1", { exact: true }).check();
  await page.locator("#bulk-price").fill("27000");
  await page.locator("#bulk-salePrice").fill("");
  await page.locator("#bulk-onHand").fill("");
  await page
    .getByRole("button", { name: "Terapkan ke SKU", exact: true })
    .click();
  assert.equal(await page.locator("#sku-price-0").inputValue(), "27000");
  assert.equal(await page.locator("#sku-price-1").inputValue(), "25000");
  assert.equal(await page.locator("#sku-sale-1").inputValue(), "22000");
  checks.push("Bulk semua/terpilih hanya mengubah field terisi");
  const sku0 = await page.locator("#sku-0").inputValue();
  await page.getByRole("button", { name: "Kembali", exact: true }).click();
  await page.getByLabel("Nama variasi 1", { exact: true }).fill("Corak");
  await page
    .getByRole("button", { name: "Lanjut ke Harga & Stok", exact: true })
    .click();
  await page.locator("#sku-0").waitFor();
  assert.equal(await page.locator("#sku-0").inputValue(), sku0);
  assert.equal(await page.locator("#sku-price-0").inputValue(), "27000");
  assert.equal(await page.locator("#sku-stock-0").inputValue(), "5");
  assert.equal(await page.locator("#bulk-price").inputValue(), "27000");
  checks.push("Back/Next dan rename menjaga SKU, harga, stok serta input bulk");
  await page.locator("#bulk-price").fill("28000");
  page.removeAllListeners("dialog");
  page.once("dialog", async (d) => {
    assert.match(d.message(), /Isian massal belum diterapkan/);
    await d.dismiss();
  });
  await page
    .getByRole("button", { name: "Simpan variasi", exact: true })
    .click();
  assert.equal(await outer().isVisible(), true);
  assert.equal(await page.locator("#sku-price-0").inputValue(), "27000");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Tutup editor variasi", exact: true })
    .click();
  assert.equal(await outer().isVisible(), true);
  await page.locator("#bulk-price").fill("27000");
  page.on("dialog", (d) => d.accept());
  checks.push(
    "Isian bulk yang belum diterapkan tidak hilang saat tutup/simpan tanpa konfirmasi",
  );
  for (const width of [360, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(
      () =>
        Math.abs(
          document.querySelector(".two-step-dialog").getBoundingClientRect()
            .width,
        ) > 0,
    );
    assert.ok(
      await outer().evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      "Overflow dialog " + width,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Overflow page " + width,
    );
    if (width < 768)
      assert.ok(
        await outer().evaluate(
          (el) => Math.abs(el.getBoundingClientRect().width - innerWidth) < 2,
        ),
      );
    await page.screenshot({ path: resolve(out, "stock-" + width + ".png") });
  }
  checks.push(
    "Desktop modal besar dan mobile fullscreen; 7 viewport tanpa overflow",
  );
  await page.setViewportSize({ width: 390, height: 500 });
  assert.ok(
    await page
      .locator(".two-step-footer")
      .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight + 1),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".seller-editor-scroll")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Kembali", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page
      .locator(".seller-editor-scroll")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page
    .getByRole("button", { name: "Lanjut ke Harga & Stok", exact: true })
    .click();
  checks.push(
    "Footer terjangkau pada tinggi 500px; reduced motion dan perpindahan keyboard tanpa animasi",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#sku-sale-0").fill("99999");
  await page
    .getByRole("button", { name: "Simpan variasi", exact: true })
    .click();
  await outer().getByRole("alert").first().waitFor();
  assert.equal(await outer().isVisible(), true);
  await page.locator("#sku-sale-0").fill("22000");
  await page
    .getByRole("button", { name: "Simpan variasi", exact: true })
    .click();
  await outer().waitFor({ state: "hidden" });
  assert.equal(await db.product.count({ where: { name } }), 0);
  await page.getByText(/Variasi diterapkan ke formulir/).waitFor();
  await page.screenshot({
    path: resolve(out, "desktop-main.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(out, "mobile-main.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push("Validasi inline dan Simpan variasi hanya draft, bukan autosave");
  await page
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .click();
  await page.locator("#sku-price-0").fill("29000");
  page.removeAllListeners("dialog");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Tutup editor variasi", exact: true })
    .click();
  assert.equal(await outer().isVisible(), true);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Tutup editor variasi", exact: true })
    .click();
  await outer().waitFor({ state: "hidden" });
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .click();
  await page.locator("#sku-price-0").waitFor();
  assert.equal(await page.locator("#sku-price-0").inputValue(), "27000");
  await page
    .getByRole("button", { name: "Simpan variasi", exact: true })
    .click();
  await outer().waitFor({ state: "hidden" });
  checks.push(
    "Tutup/konfirmasi batal memulihkan snapshot tanpa kehilangan draft sebelumnya",
  );
  await saveProduct();
  let product = await db.product.findFirstOrThrow({
    where: { name },
    include: {
      variants: { include: { inventory: true, optionValues: true } },
      optionGroups: { include: { values: true } },
    },
  });
  assert.equal(product.variants.length, 4);
  assert.equal(product.optionGroups.length, 3);
  assert.equal(product.variants.find((v) => v.sku === sku0).price, 27000);
  assert.equal(
    product.variants.find((v) => v.sku === sku0).inventory.onHand,
    5,
  );
  assert.ok(product.optionGroups.some((g) => g.values.some((v) => v.imageId)));
  const originalIds = product.variants.map((v) => v.id).sort();
  checks.push("Simpan produk permanen menjaga kombinasi, harga, stok dan foto");
  await page.reload();
  await tab("Harga & Variasi");
  assert.equal(await page.locator(".variation-overview-card").count(), 4);
  assert.equal(
    await page.locator(".variation-overview-options img").count(),
    1,
  );
  await page
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .click();
  await page.locator("#sku-price-0").waitFor();
  assert.equal(await page.locator("#sku-price-0").inputValue(), "27000");
  await page.getByRole("button", { name: "Kembali", exact: true }).click();
  await page.getByLabel("Opsi Corak 1", { exact: true }).fill("Polos baru");
  await page.getByRole("button", { name: "Urutkan opsi", exact: true }).click();
  await page
    .getByRole("button", { name: "Urutkan opsi Polos baru", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Selesai mengurutkan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lanjut ke Harga & Stok", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simpan variasi", exact: true })
    .click();
  await saveProduct();
  assert.deepEqual(
    (await db.productVariant.findMany({ where: { productId: product.id } }))
      .map((v) => v.id)
      .sort(),
    originalIds,
  );
  assert.equal(
    (await db.productVariant.findUniqueOrThrow({ where: { sku: sku0 } })).price,
    27000,
  );
  checks.push(
    "Reopen/rename/reorder existing menjaga seluruh ID SKU dan pasangan harga tersimpan",
  );

  await page
    .getByRole("button", { name: "Atur variasi", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Tambahkan opsi/ })
    .first()
    .click();
  await page.getByLabel("Opsi Corak 3", { exact: true }).fill("Batik");
  await page
    .getByRole("button", { name: "Lanjut ke Harga & Stok", exact: true })
    .click();
  await page.locator("#sku-5").waitFor();
  assert.equal(await page.locator("#sku-stock-5").inputValue(), "0");
  await page
    .getByRole("button", { name: "Simpan variasi", exact: true })
    .click();
  await saveProduct();
  let expanded = await db.productVariant.findMany({
    where: { productId: product.id },
    include: { inventory: true },
  });
  assert.equal(expanded.length, 6);
  assert.ok(
    originalIds.every((id) =>
      expanded.some((v) => v.id === id && v.inventory.onHand === 5),
    ),
  );
  checks.push("Opsi baru: SKU baru stok 0, existing SKU dan stok tetap");
  await page
    .getByRole("button", { name: "Atur variasi", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Hapus opsi Batik", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Hapus opsi?", exact: true })
    .getByRole("button", { name: "Hapus opsi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lanjut ke Harga & Stok", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Review pembentukan SKU", exact: true })
    .getByRole("button", { name: "Buat kombinasi", exact: true })
    .click();
  await page.locator("#sku-0").waitFor();
  await page
    .getByRole("button", { name: "Simpan variasi", exact: true })
    .click();
  await saveProduct();
  assert.deepEqual(
    (await db.productVariant.findMany({ where: { productId: product.id } }))
      .map((v) => v.id)
      .sort(),
    originalIds,
  );
  assert.equal(
    await db.inventoryMovement.count({
      where: { variantId: { in: originalIds } },
    }),
    4,
  );
  checks.push(
    "Hapus opsi aman hanya melepas SKU tanpa riwayat; movement existing tidak bertambah",
  );
  const legacy = await db.product.create({
    data: {
      name: "Legacy " + run.slice(0, 8),
      slug: "legacy-" + run,
      basePrice: 19000,
      weightGrams: 100,
      images: { create: { url: "/icon.svg", alt: "Fixture local" } },
      variants: {
        create: [
          {
            sku: "L-" + run,
            color: "Hitam",
            size: "M",
            price: 21000,
            inventory: { create: { onHand: 3 } },
          },
        ],
      },
    },
    include: { variants: true },
  });
  await page.goto(origin + "/admin/products/" + legacy.id);
  await tab("Harga & Variasi");
  assert.equal(await page.getByRole("switch").isChecked(), true);
  await page
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .click();
  await page.locator("#sku-0").waitFor();
  assert.equal(await page.locator("#sku-0").isEditable(), false);
  await page.locator("#sku-price-0").fill("22000");
  await page
    .getByRole("button", { name: "Simpan variasi", exact: true })
    .click();
  await saveProduct();
  const legacyAfter = await db.product.findUniqueOrThrow({
    where: { id: legacy.id },
    include: { variants: { include: { inventory: true } } },
  });
  assert.equal(legacyAfter.variants[0].id, legacy.variants[0].id);
  assert.equal(legacyAfter.variants[0].inventory.onHand, 3);
  assert.equal(legacyAfter.variants[0].price, 22000);
  assert.equal(legacyAfter.optionsEnabled, false);
  checks.push(
    "Legacy multi-option adoption menjaga SKU terlindungi, stock dan harga",
  );

  const managerRole = await db.role.upsert({
    where: { name: "Manager" },
    update: {},
    create: { name: "Manager", label: "Pengelola katalog" },
  });
  for (const key of ["product.read", "product.update", "inventory.read"]) {
    const permission = await db.permission.findUniqueOrThrow({
      where: { key },
    });
    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: managerRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: { roleId: managerRole.id, permissionId: permission.id },
    });
  }
  const manager = await db.user.create({
    data: {
      name: "Pengelola Uji",
      email: run + "-manager@example.test",
      passwordHash: "disabled-local-test",
      roles: { create: { roleId: managerRole.id } },
    },
  });
  const managerToken = await new SignJWT({ email: manager.email, ver: 0 })
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
      value: managerToken,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const readPage = await readContext.newPage();
  await readPage.goto(origin + "/admin/products/" + product.id);
  await readPage
    .getByRole("tab", { name: "Harga & Variasi", exact: true })
    .click();
  await readPage
    .getByRole("button", { name: "Atur harga & stok", exact: true })
    .click();
  await readPage.locator("#sku-stock-0").waitFor();
  assert.equal(await readPage.locator("#sku-stock-0").isDisabled(), true);
  await readPage.getByRole("button", { name: "Kembali", exact: true }).click();
  await readPage
    .getByRole("button", { name: "Kembali ke produk", exact: true })
    .click();
  await readPage.locator(".two-step-dialog").waitFor({ state: "hidden" });
  assert.equal(
    await readPage
      .getByRole("button", { name: "Atur harga & stok", exact: true })
      .evaluate((el) => document.activeElement === el),
    true,
  );
  await readContext.close();
  checks.push(
    "Hak stok readonly tetap berlaku dan fokus kembali ke pemicu setelah tutup",
  );
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
  checks.push("Guard perubahan belum tersimpan tetap bekerja lintas tab");
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
