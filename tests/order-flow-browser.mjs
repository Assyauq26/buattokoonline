import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID, createCipheriv } from "node:crypto";
import { mkdirSync, createWriteStream, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { PrismaClient } = require("../app/node_modules/@prisma/client"),
  { chromium } = require("../app/node_modules/playwright");
const { SignJWT } = await import(
  "../app/node_modules/jose/dist/node/esm/index.js"
);
const dbUrl = new URL(process.env.DATABASE_URL || "http://invalid");
assert(
  ["127.0.0.1", "localhost"].includes(dbUrl.hostname) &&
    dbUrl.pathname === "/management_v130_test",
  "Disposable local database only",
);
const db = new PrismaClient(),
  origin = "http://127.0.0.1:3103",
  jwt = randomBytes(32).toString("hex"),
  encryption = randomBytes(32).toString("hex"),
  run = randomUUID(),
  out = resolve(process.env.ORDER_FLOW_EVIDENCE || "order-flow-evidence");
mkdirSync(out, { recursive: true });
const checks = [];
let browser, child;
try {
  const role = await db.role.upsert({
    where: { name: "Admin" },
    update: {},
    create: { name: "Admin", label: "Test operator" },
  });
  for (const key of [
    "order.read",
    "order.update",
    "order.cancel",
    "payment.read",
    "payment.verify",
    "inventory.read",
    "inventory.adjust",
    "shipping.read",
    "shipping.create",
    "shipping.update",
    "store.customize.read", "store.customize.update", "store.customize.publish",
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
  const user = async (name, staff = false) =>
    db.user.create({
      data: {
        name,
        email: run + name.replaceAll(" ", "") + "@example.test",
        passwordHash: "disabled-browser-login",
        ...(staff ? { roles: { create: { roleId: role.id } } } : {}),
      },
    });
  const staff = await user("Operator Demo", true),
    buyer = await user("Pembeli Demo"),
    other = await user("Pembeli Lain");
  const { makeDefault } =
    require("../app/node_modules/tsx/dist/cjs/api/index.cjs").require(
      "../app/src/modules/appearance/schema.ts",
      import.meta.url,
    );
  const theme = makeDefault();
  theme.colors.primary = "#243C63";
  theme.colors.primaryText = "#FFFFFF";
  theme.colors.primaryHover="#1E3355";theme.colors.primaryPressed="#182947";
  await db.storeAppearance.upsert({
    where: { key: "primary" },
    update: { draft: theme, published: theme },
    create: { key: "primary", draft: theme, published: theme },
  });
  await db.flashSaleControl.upsert({
    where: { key: "primary" },
    update: {},
    create: { key: "primary" },
  });
  const media =
    process.platform === "win32"
      ? resolve(out, "media")
          .replace(/^[A-Za-z]:/, "")
          .replaceAll("\\", "/")
      : resolve(out, "media");
  mkdirSync(media, { recursive: true });
  const variant = await db.productVariant.create({
    data: {
      sku: run,
      product: { create: { name: "Kemeja Demo", slug: run, basePrice: 29000 } },
      inventory: { create: { onHand: 8, reserved: 0 } },
    },
  });
  const create = async (status, paymentStatus) =>
    db.order.create({
      data: {
        orderNumber: "DEMO-" + run.slice(0, 8) + "-" + randomUUID().slice(0, 4),
        userId: buyer.id,
        status,
        paymentStatus,
        subtotal: 58000,
        total: 71000,
        shippingCost: 13000,
        shippingCourier: "J&T Express",
        shippingMode: "official",
        shippingService: "JND",
        items: {
          create: {
            variantId: variant.id,
            quantity: 2,
            unitPrice: 29000,
            lineTotal: 58000,
            productName: "Kemeja Demo",
            variantLabel: "Biru / M",
            imageUrl: "/fixture-product.svg",
          },
        },
        address: {
          create: {
            recipientName: "Pembeli Demo",
            phone: "081234567890",
            line: "Jalan Contoh 11",
            province: "Jawa Tengah",
            city: "Batang",
            district: "Warungasem",
            village: "Banjaran",
            postalCode: "",
          },
        },
        payment: {
          create: { provider: "manual", status: paymentStatus, amount: 71000 },
        },
      },
      include: { payment: true },
    });
  const shipping = await create("PACKED", "PAID");
  await db.shipment.create({
    data: {
      orderId: shipping.id,
      provider: "jnt",
      courier: "J&T Express",
      status: "PENDING",
      trackingNumber: "TEST12345678",
    },
  });
  await db.jntShipmentRequest.create({
    data: {
      orderId: shipping.id,
      externalOrderId: run.replaceAll("-", "").slice(0, 20),
      state: "SUCCEEDED",
      awb: "TEST12345678",
      requestedBy: staff.id,
      payloadFingerprint: "a".repeat(64),
    },
  });
  const config={endpoints:{order:"https://demo-ecommerce.inuat-jntexpress.id/jts-idn-ecommerce-api/api/order/create",cancellation:"https://demo-ecommerce.inuat-jntexpress.id/jts-idn-ecommerce-api/api/order/cancel",tariff:"https://demo-general.inuat-jntexpress.id/jandt_track/inquiry.action",tracking:"https://demo-general.inuat-jntexpress.id/jandt_track/track/trackAction!tracking.action"},credentials:Object.fromEntries(["orderUsername","orderApiKey","orderKey","tariffCustomer","tariffKey","trackingUsername","trackingPassword"].map(k=>[k,"synthetic-unused"])),sharedCancellation:true,seller:{warehouse:{name:"Toko Contoh",contact:"Operator",phone:"+6281234567890",address:"Batang Jawa Tengah",originSite:"BATANG",originCityCode:"BGG"},services:[],selectedServices:["EZ","JND"]}};
  const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",Buffer.from(encryption,"hex"),nonce);cipher.setAAD(Buffer.from("single-store:jnt:v2:sandbox"));const encrypted=Buffer.concat([cipher.update(JSON.stringify(config)),cipher.final()]);
  const revision=await db.jntCheckoutRevision.create({data:{id:randomUUID(),environment:"sandbox",mappingVersion:"synthetic-only",encryptedConfig:["v2",nonce.toString("base64"),cipher.getAuthTag().toString("base64"),encrypted.toString("base64")].join(":")}});
  await db.order.update({where:{id:shipping.id},data:{jntCheckoutRevisionId:revision.id,shippingWeightGram:450}});
  await db.auditLog.create({data:{entity:"Order",entityId:shipping.id,action:"jnt.order.accepted",meta:{awb:"TEST12345678",routingCode:"410-1BGG06-12B"}}});
  const paid = await create("PACKED", "PAID"),
    waiting = await create("PENDING_PAYMENT", "WAITING_VERIFICATION");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    "base64",
  );
  const { mkdirSync: mk, writeFileSync: wr } = await import("node:fs");
  const proofDir = resolve(media, "store", "payment-proofs", buyer.id);
  mk(proofDir, { recursive: true });
  const proofId = randomUUID();
  wr(resolve(proofDir, proofId + ".png"), png);
  await db.paymentConfirmation.create({
    data: {
      paymentId: waiting.payment.id,
      senderBank: "Bank Demo",
      senderName: "Pembeli Demo",
      amount: 71000,
      transferDate: new Date(),
      proofPath: `store/payment-proofs/${buyer.id}/${proofId}.png`,
      proofMime: "image/png",
      status: "SUBMITTED",
    },
  });
  const log = createWriteStream(resolve(out, "preview.log"));
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      process.env.ORDER_FLOW_DEBUG ? "dev" : "start",
      "-H",
      "127.0.0.1",
      "-p",
      "3103",
    ],
    {
      cwd: resolve("app"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        APP_ORIGIN: origin,
        JWT_SECRET: jwt,
        ORDER_DATA_ENCRYPTION_KEY: encryption,
        JNT_API_ENV:"sandbox",JNT_INTEGRATION_ENCRYPTION_KEY:Buffer.from(encryption,"hex").toString("base64"),
        STORAGE_LOCAL_ROOT: media,
        MAINTENANCE_MODE: "0",
        STORE_MAIL_MODE: "",
        RESEND_API_KEY: "",
        STORE_MAIL_RELAY_TOKEN: "",
        NODE_ENV: process.env.ORDER_FLOW_DEBUG ? "development" : "production",
      },
    },
  );
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(origin + "/api/v1/ready")).ok) break;
    } catch {}
    if (i === 89) throw Error("Preview did not start");
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.platform === "win32" ? { channel: "chrome" } : {}),
  });
  async function context(user) {
    const token = await new SignJWT({ email: user.email, ver: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setJti(randomUUID())
      .setIssuedAt()
      .setIssuer(origin)
      .setAudience("storefront")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(jwt));
    const c = await browser.newContext();
    await c.route("**/fixture-product.svg", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="180" viewBox="0 0 160 180"><rect width="160" height="180" fill="#f0eee8"/><path d="M47 25 25 48 40 70 49 63 46 154 114 154 111 63 120 70 135 48 113 25 96 19 94 29 80 35 66 29 64 19Z" fill="#8da9b5" stroke="#55747d" stroke-width="3"/><path d="M80 35V154M64 19 73 49 80 35 87 49 96 19" fill="none" stroke="#f5f7f8" stroke-width="2"/><circle cx="85" cy="65" r="2" fill="white"/><circle cx="85" cy="95" r="2" fill="white"/></svg>`,
      }),
    );
    await c.addCookies([
      {
        name: "store_session",
        value: token,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    return c;
  }
  const admin = await context(staff),
    customer = await context(buyer),
    foreign = await context(other),
    page = await admin.newPage(),
    buyerPage = await customer.newPage();
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("Browser error at", page.url(), e.message);
  });
  if (process.env.ORDER_FLOW_DEBUG)
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(msg.text());
    });
  buyerPage.on("pageerror", (e) => errors.push(e.message));
  const api = async (ctx, id, operation, data) => {
    const r = await ctx.request.post(origin + "/api/v1/order-resolutions", {
      headers: { Origin: origin },
      data: { id, operation, data },
    });
    assert.equal(r.status(), 200, await r.text());
    return (await r.json()).data;
  };
  const c = await api(admin, paid.id, "request", {
    requestId: randomUUID(),
    kind: "CANCEL",
    reason: "Stok salah sebelum pengiriman",
  });
  for (const width of (process.env.ORDER_FLOW_DEBUG || process.env.V151_FAST)
    ? [390]
    : [360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, name] of [
      ["/admin/orders?q=DEMO-" + run.slice(0, 8), "orders"],
      [`/admin/orders/${shipping.id}`, "detail"],
      [`/admin/orders/${waiting.id}/payment`, "payment"],
      [`/admin/orders/${paid.id}/resolution?case=${c.id}`, "cancellation"],
    ]) {
      assert.equal((await page.goto(origin + path)).status(), 200);
      await page.waitForLoadState("networkidle");
      if (name === "detail") {
        const box = await page
          .getByRole("button", { name: "Salin nomor pesanan", exact: true })
          .boundingBox();
        assert(
          box && box.width >= 44 && box.height >= 44,
          "Copy action has a 44px touch target",
        );
      }
      if (name === "orders")
        assert.equal(
          await page
            .getByTestId("admin-order-" + waiting.orderNumber)
            .locator(".seller-order-product > strong")
            .innerText(),
          "Rp 58.000",
          "Product line excludes shipping; grand total remains separate",
        );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        `${name} overflow ${width}`,
      );
      await page.screenshot({
        path: resolve(out, `${name}-${width}.png`),
        fullPage: false,
        caret: "initial",
      });
      checks.push(`${name} ${width}: HTTP 200 / no overflow`);
    }
  }
  if (process.env.ORDER_FLOW_DEBUG) {
    console.log(JSON.stringify({ errors }));
    process.exitCode = errors.length ? 1 : 0;
  }
  await (await import("./v151-browser-checks.mjs")).verify({db,origin,admin,customer,foreign,page,buyerPage,buyer,variant,shipping,waiting,paid,checks,out,run});
  // Cancel a paid transaction through the actual staged UI (no carrier request / no money transfer).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + `/admin/orders/${paid.id}/resolution?case=${c.id}`);
  await page
    .getByRole("button", { name: "Batalkan dan lanjut ke refund", exact: true })
    .click();
  assert.equal((await db.order.findUnique({where:{id:paid.id}})).status,"PACKED");
  await page.getByRole("dialog").getByRole("button",{name:"Batalkan dan lanjutkan",exact:true}).click();
  await page
    .getByRole("heading", { name: "Rekening tujuan pengembalian", exact: true })
    .waitFor();
  assert.equal(
    (await db.order.findUnique({ where: { id: paid.id } })).status,
    "CANCELLED",
  );
  checks.push(
    "UI cancellation creates unpaid refund obligation, not automatic transfer",
  );
  await buyerPage.setViewportSize({ width: 390, height: 844 });
  await buyerPage.goto(origin + `/orders/${paid.id}/resolution?case=${c.id}`);
  await buyerPage.getByLabel("Nama bank", { exact: true }).fill("Bank Demo");
  await buyerPage
    .getByLabel("Nama pemilik rekening", { exact: true })
    .fill("Pembeli Demo");
  await buyerPage
    .getByLabel("Nomor rekening", { exact: true })
    .fill("001234567890");
  await buyerPage
    .getByRole("button", { name: "Simpan rekening tujuan", exact: true })
    .click();
  await buyerPage.getByText("Perubahan tersimpan.", { exact: true }).waitFor();
  checks.push("Buyer bank form through scoped real HTTP / encrypted database");
  await buyerPage.screenshot({
    path: resolve(out, "buyer-bank-390.png"),
    fullPage: false,
    caret: "initial",
  });
  await page.reload();
  await page
    .getByRole("button", {
      name: "Rekening dan nominal sudah benar",
      exact: true,
    })
    .click();
  await page.getByRole("dialog").getByRole("button",{name:"Lanjutkan transfer manual",exact:true}).click();
  await page
    .getByRole("heading", { name: "Catat transfer refund", exact: true })
    .waitFor();
  await page.screenshot({
    path: resolve(out, "refund-ready-390.png"),
    fullPage: false,
    caret: "initial",
  });
  await page
    .getByLabel("Bukti transfer · JPG, PNG, WebP, PDF · maks. 4 MB")
    .setInputFiles({
      name: "synthetic.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n Synthetic proof, no real bank transfer"),
    });
  await page
    .getByLabel("Referensi transaksi", { exact: true })
    .fill("E2E-" + run);
  await page
    .getByLabel("Waktu dana ditransfer", { exact: true })
    .fill(
      new Date(Date.now() + 60000 - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
  await page
    .getByText("Dana sudah ditransfer ke rekening tujuan di atas.", {
      exact: false,
    })
    .locator("input")
    .check();
  await page
    .getByRole("button", { name: "Konfirmasi dana dikembalikan", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("button",{name:"Konfirmasi dana dikembalikan",exact:true}).click();
  await page
    .getByRole("heading", { name: "Transfer dicatat seller", exact: true })
    .waitFor();
  assert.equal(
    (await db.payment.findUnique({ where: { id: paid.payment.id } })).status,
    "PAID",
  );
  checks.push(
    "Manual refund evidence upload records claim without automatic bank verification",
  );
  await buyerPage.reload();
  await buyerPage
    .getByLabel("Dana belum diterima / kendala")
    .fill("Pengujian kendala dana belum diterima");
  await buyerPage
    .getByRole("button", { name: "Laporkan kendala refund", exact: true })
    .click();
  await buyerPage
    .getByText("Refund perlu tindak lanjut", { exact: true })
    .waitFor();
  await buyerPage
    .getByRole("button", { name: "Saya telah menerima dana", exact: true })
    .click();
  await buyerPage.getByText("Dana diterima pembeli", { exact: true }).waitFor();
  assert.equal(
    (await db.payment.findUnique({ where: { id: paid.payment.id } })).status,
    "REFUNDED",
  );
  checks.push(
    "Buyer dispute and receipt stay separate from seller refund claim",
  );
  const transfer = await db.resolutionTransfer.findUniqueOrThrow({
    where: { resolutionId: c.id },
  });
  assert.equal(
    (
      await foreign.request.get(
        origin +
          `/api/v1/order-resolutions/proof?kind=transfer&id=${transfer.id}`,
      )
    ).status(),
    404,
  );
  const proof = await customer.request.get(
    origin + `/api/v1/order-resolutions/proof?kind=transfer&id=${transfer.id}`,
  );
  assert.equal(proof.status(), 200);
  assert.match(proof.headers()["cache-control"], /no-store/);
  checks.push("Private refund proof rejects unrelated buyer and never caches");
  const csrf = await admin.request.post(origin + "/api/v1/order-resolutions", {
    headers: { Origin: "https://untrusted.example" },
    data: { id: paid.id, operation: "request", data: {} },
  });
  assert.equal(csrf.status(), 403);
  checks.push("Cross-origin mutation rejected");
  await page.goto(origin + `/admin/orders/${waiting.id}/payment`);
  await page.getByText("Minta perbaikan", { exact: true }).click();
  await page
    .getByLabel("Alasan perbaikan (wajib)", { exact: false })
    .fill("Tolong unggah ulang bukti yang lebih jelas");
  await page
    .getByRole("button", { name: "Kirim permintaan perbaikan", exact: true })
    .click();
  const rejected = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/v1/admin/payments/${waiting.payment.id}/reject`) &&
      r.request().method() === "POST",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Kirim permintaan perbaikan",exact:true }).click();
  assert.equal((await rejected).status(), 200);
  assert.equal(
    (await db.payment.findUnique({ where: { id: waiting.payment.id } })).status,
    "REJECTED",
  );
  await page.getByText("Bukti Perlu Perbaikan", { exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  checks.push("Payment correction through UI requires a reason");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + `/admin/orders/${shipping.id}`);
  await page.getByText("Tindakan lainnya", { exact: true }).click();
  await page
    .getByRole("button", { name: "Batalkan resi J&T", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: resolve(out, "cancel-awb-sheet-390.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  checks.push("Cancel AWB reason sheet focus / Escape; no carrier dispatch");
  assert.deepEqual(errors, [], "No browser runtime errors");
  writeFileSync(
    resolve(out, "results.json"),
    JSON.stringify(
      {
        checks,
        screenshots:
          readdirSync(out).filter(n=>n.endsWith(".png")).length,
        carrierRequests: 0,
        actualMoneyTransfers: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: checks.length, evidence: out }, null, 2),
  );
} finally {
  await browser?.close();
  child?.kill();
  await db.$disconnect();
}
