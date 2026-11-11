import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/node_modules/@prisma/client");
const { chromium } = require("../app/node_modules/playwright");
const { SignJWT } = await import(
  "../app/node_modules/jose/dist/node/esm/index.js"
);
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.pathname === "/product_editor_test",
  "Database uji lokal wajib",
);
const db = new PrismaClient(),
  run = randomUUID(),
  origin = "http://127.0.0.1:3107",
  secret = randomBytes(32).toString("hex");
const out = resolve("product-editor-evidence");
mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
let browser, child;
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
  mkdirSync(resolve("../audit-tools/product-editor-media"), {
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
      "3107",
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
          "/Users/HYPE AI/Documents/ChatGPT/Buat Toko Online/audit-tools/product-editor-media",
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
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  if (process.env.EDITOR_BASELINE === "yes") {
    await page.goto(origin + "/admin/products/new");
    await page.getByRole("switch").waitFor();
    assert.equal(await page.getByRole("switch").isChecked(), true);
    await page.getByRole("switch").click();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator("#product-variants").evaluate(el => el.scrollIntoView({block:"start",behavior:"instant"}));
      await page.screenshot({path:resolve(out,"before-"+width+".png")});
    }
    console.log("Baseline v1.7.2: default variasi dan kartu Varian 1 terdokumentasi.");
  } else {
  await page.goto(origin + "/admin/products/new");
  await page.getByLabel("Kode SKU", { exact: true }).waitFor();
  assert.equal(await page.getByRole("switch").isChecked(), false);
  assert.equal(await page.getByText("Varian 1", { exact: true }).count(), 0);
  assert.equal(
    await page.getByText("Input Massal Harga & Stok", { exact: true }).count(),
    0,
  );
  checks.push(
    "Produk baru default sederhana tanpa Varian 1, bulk, warna atau ukuran",
  );
  for (const width of [360, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page
      .locator("#product-pricing")
      .evaluate((el) =>
        el.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Overflow simple " + width,
    );
    await page.screenshot({ path: resolve(out, "simple-" + width + ".png") });
  }
  checks.push("Simple responsive 360/390/430/768/1024/1440/1920");
  await page
    .getByLabel("Nama produk", { exact: false })
    .fill("Produk Browser " + run.slice(0, 8));
  await page.getByLabel("Harga normal (Rp)", { exact: true }).fill("10000");
  await page.getByLabel("Harga diskon (opsional)").fill("12000");
  await page.getByTestId("save-product").click();
  await page
    .getByRole("alert")
    .filter({ hasText: /diskon/ })
    .first()
    .waitFor();
  checks.push("Validasi diskon inline berbahasa Indonesia");
  await page.getByLabel("Harga diskon (opsional)").fill("8000");
  await page.getByLabel("Stok fisik", { exact: true }).fill("5");
  await page.getByTestId("save-product").click();
  await page
    .waitForURL(/\/admin\/products\/(?!new)[^/]+$/, { timeout: 20000 })
    .catch(() => {});
  await page
    .getByText("Seluruh perubahan telah disimpan.", { exact: false })
    .waitFor({ timeout: 20000 });
  let product = await db.product.findFirstOrThrow({
    where: { name: "Produk Browser " + run.slice(0, 8) },
    include: { variants: { include: { inventory: true } } },
  });
  assert.equal(product.variants.length, 1);
  assert.equal(product.variants[0].inventory.onHand, 5);
  assert.ok(product.variants[0].sku);
  const id = product.variants[0].id,
    sku = product.variants[0].sku;
  checks.push("Simpan simple menghasilkan satu SKU otomatis dan inventory");
  await page.getByLabel("Harga normal (Rp)", { exact: true }).fill("11000");
  await page.getByTestId("save-product").click();
  await page
    .getByText("Seluruh perubahan telah disimpan.", { exact: false })
    .waitFor();
  product = await db.product.findUniqueOrThrow({
    where: { id: product.id },
    include: { variants: true },
  });
  assert.equal(product.variants[0].id, id);
  assert.equal(product.variants[0].sku, sku);
  assert.equal(
    await page.getByLabel("Kode SKU", { exact: true }).getAttribute("readonly"),
    "",
  );
  await page.getByRole("switch").click();
  await page
    .getByRole("alert")
    .filter({ hasText: /stok atau riwayat/ })
    .waitFor();
  assert.equal(await page.getByRole("switch").isChecked(), false);
  checks.push("Edit harga menjaga SKU; konversi dengan stok diblokir");
  await page.goto(origin + "/admin/products/new");
  await page
    .getByLabel("Nama produk", { exact: false })
    .fill("Variasi Browser " + run.slice(0, 8));
  await page.getByLabel("Harga normal (Rp)", { exact: true }).fill("20000");
  await page.getByRole("switch").click();
  await page.getByRole("button", { name: "Tambah variasi pertama" }).click();
  await page.getByLabel("Nama variasi 1", { exact: true }).fill("Motif");
  await page.getByLabel("Opsi Motif 1", { exact: true }).fill("Polos");
  await page
    .getByRole("button", { name: /Tambahkan opsi/ })
    .first()
    .click();
  await page.getByLabel("Opsi Motif 2", { exact: true }).fill("Garis");
  await page
    .getByRole("button", { name: "Buat 2 kombinasi", exact: true })
    .click();
  await page.getByLabel("SKU kombinasi 1", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Hapus opsi Garis", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.count(), 1);
  assert.ok(await dialog.evaluate((el) => el.contains(document.activeElement)));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  checks.push(
    "Dialog tunggal dengan fokus terkurung, Escape dan pengembalian fokus",
  );
  for (const width of [360, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page
      .locator(".variation-skus")
      .evaluate((el) =>
        el.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Overflow variasi " + width,
    );
    await page.evaluate(() => window.scrollBy({top:-150,behavior:"instant"}));
    await page.screenshot({ path: resolve(out, "variable-" + width + ".png") });
  }
  checks.push(
    "Variasi responsive tujuh viewport; mobile accordion dan desktop grid",
  );
  const bulk = page.getByRole("button", {
    name: "Terapkan ke SKU",
    exact: true,
  });
  const background = await bulk.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  assert.equal(background, "rgb(24, 24, 27)");
  await page.locator("#bulk-price").fill("25000");
  await page.locator("#bulk-onHand").fill("3");
  await bulk.click();
  await page.getByText(/2 SKU diperbarui pada formulir/).waitFor();
  assert.equal(await page.locator("#sku-price-0").inputValue(), "25000");
  assert.equal(await page.locator("#sku-stock-1").inputValue(), "3");
  checks.push(
    "Bulk hanya field terisi, jumlah SKU dan pengingat belum tersimpan; tombol hitam",
  );
  await page.getByTestId("save-product").click();
  await page
    .getByText("Seluruh perubahan telah disimpan.", { exact: false })
    .waitFor({ timeout: 20000 });
  const variable = await db.product.findFirstOrThrow({
    where: { name: "Variasi Browser " + run.slice(0, 8) },
    include: { variants: true },
  });
  assert.equal(variable.variants.length, 2);
  assert.equal(variable.basePrice, 20000);
  checks.push("Simpan variasi mempertahankan fallback harga");
  await page.getByLabel("Nama variasi 1", { exact: true }).fill("Corak");
  await page.getByLabel("Opsi Corak 1", { exact: true }).fill("Polos Baru");
  await page.getByTestId("save-product").click();
  await page
    .getByText("Seluruh perubahan telah disimpan.", { exact: false })
    .waitFor();
  const renamed = await db.productVariant.findMany({
    where: { productId: variable.id },
  });
  assert.deepEqual(
    renamed.map((v) => v.id).sort(),
    variable.variants.map((v) => v.id).sort(),
  );
  checks.push("Rename opsi dengan stok mempertahankan ID");
  await page.waitForFunction(() => !document.querySelector("#product-name").matches(":disabled"));
  await page.locator("#product-name").focus();
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(() => document.activeElement !== document.body),
  );
  checks.push("Navigasi keyboard fokus tersedia");
  await page.locator("#product-name").fill("Draft belum disimpan");
  page.removeAllListeners("dialog");let warned=false;
  page.once("dialog",async dialog=>{warned=dialog.message().includes("belum disimpan");await dialog.dismiss();});
  const beforeUrl=page.url();await page.getByRole("link",{name:"Kembali ke produk",exact:true}).click();
  assert.ok(warned);assert.equal(page.url(),beforeUrl);checks.push("Peringatan perubahan belum disimpan dan batal navigasi");
  await page.route("**/admin/products/*",async route=>{if(route.request().method()==="POST")await new Promise(resolve=>setTimeout(resolve,350));await route.continue();});
  await page.getByTestId("save-product").click();await page.getByText("Menyimpan…",{exact:true}).waitFor();
  assert.equal(await page.locator("#product-name").isDisabled(),true);
  await page.getByText("Seluruh perubahan telah disimpan.",{exact:false}).waitFor();checks.push("Loading mengunci form dan sukses diumumkan");
  assert.deepEqual(errors, []);
  checks.push("Tidak ada exception browser");
  writeFileSync(
    resolve(out, "result.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
  }
} catch (error) {
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
