import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/node_modules/@prisma/client");
const { chromium } = require("../app/node_modules/@playwright/test");
const bcrypt = require("../app/node_modules/bcryptjs");
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/management_v130_test");
const db = new PrismaClient();
const origin = "http://127.0.0.1:3117";
const output = resolve("output/store-identity");
const run = randomUUID().slice(0, 8);
let child, browser, user;
const logs = [];
try {
  await mkdir(output, { recursive: true });
  await mkdir(resolve(output, "media"), { recursive: true });
  await db.flashSaleControl.upsert({ where: { key: "primary" }, create: { key: "primary" }, update: {} });
  const role = await db.role.upsert({
    where: { name: "Admin" }, create: { name: "Admin", label: "Admin" }, update: {},
  });
  for (const key of ["store.customize.read", "store.customize.update", "store.customize.publish"]) {
    const permission = await db.permission.upsert({
      where: { key }, create: { key, label: key }, update: {},
    });
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      create: { roleId: role.id, permissionId: permission.id }, update: {},
    });
  }
  const password = randomBytes(24).toString("hex");
  user = await db.user.create({
    data: { name: "Identity Demo", email: randomUUID() + "@example.test",
      passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date(),
      roles: { create: { roleId: role.id } } },
  });
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3117"], {
    cwd: resolve("app"), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", APP_ORIGIN: origin,
      JWT_SECRET: randomBytes(32).toString("hex"), STORE_MAIL_MODE: "", STORE_MAIL_RELAY_TOKEN: "",
      RESEND_API_KEY: "", MAINTENANCE_MODE: "0",
      STORAGE_LOCAL_ROOT: resolve(output, "media").replaceAll("\\", "/").replace(/^[A-Za-z]:/, "") },
  });
  child.stdout.on("data", data => logs.push(data.toString()));
  child.stderr.on("data", data => logs.push(data.toString()));
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(origin + "/api/v1/ready")).ok) break; } catch {}
    if (attempt === 59) throw Error("Local preview unavailable");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const response = await context.request.post(origin + "/api/v1/auth/login", {
    headers: { Origin: origin }, data: { identifier: user.email, password },
  });
  assert.equal(response.status(), 200);
  await context.addCookies((await context.cookies()).map(cookie => ({ ...cookie, secure: false })));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(origin + "/admin/settings/store");
    await page.getByRole("heading", { name: "Informasi Toko", exact: true }).waitFor();
    await page.getByLabel("Nama toko", { exact: true }).fill("Hubify " + width + " " + run);
    const [saved] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith("/api/v1/admin/store-information")),
      page.getByRole("button", { name: "Simpan perubahan", exact: true }).click(),
    ]);
    assert.equal(saved.status(), 200);
    await page.getByRole("status").filter({ hasText: "Informasi toko tersimpan dan diterbitkan." }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: resolve(output, "store-" + width + ".png"), fullPage: true });
    await page.reload();
    assert.equal(await page.getByLabel("Nama toko", { exact: true }).inputValue(), "Hubify " + width + " " + run);
  }
  assert.deepEqual(errors, []);
  assert.equal((await db.storeMailBrandSync.findUniqueOrThrow({ where: { id: 1 } })).name, "Hubify 1440 " + run);
  console.log(JSON.stringify({ savedAndReloaded: [360, 390, 430, 1440], durableEvent: "PASS", messagesSent: 0 }));
} finally {
  await browser?.close();
  if (child) {
    const stopped = new Promise(resolve => child.once("exit", resolve));
    child.kill();
    if (child.exitCode === null) await stopped;
  }
  await writeFile(resolve(output, "preview.log"), logs.join(""));
  if (user) {
    await db.auditLog.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
}
