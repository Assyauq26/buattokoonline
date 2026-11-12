import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

export async function verifyShippingSettings({ page, context, base, sql, dc, province, city, district, village, pass, expect }) {
  const settings = base + "/api/v1/admin/shipping/settings";
  const mapping = base + "/api/v1/admin/integrations/jnt/mapping";
  const headers = { Origin: base };
  const put = (url, data) => context.request.put(url, { headers, data });
  assert.equal((await put(settings, { method: "manual", cost: -1 })).status(), 422);
  assert.equal((await put(settings, { method: "manual", cost: 1.25 })).status(), 422);
  assert.equal((await put(settings, { method: "manual", cost: 0 })).status(), 200);
  assert.equal(sql('SELECT "manualFlat" FROM "ShippingSettings";'), "0");
  assert.equal((await put(settings, { method: "jnt", environment: "sandbox" })).status(), 409);
  assert.equal(sql('SELECT count(*) FROM "ShippingSettings" WHERE "manualFlat"=0 AND "activeJntId" IS NULL;'), "1");
  await page.goto(base + "/admin/shipping");
  await page.getByLabel("Tarif per pesanan (Rp)").fill("19000");
  await page.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Pengiriman Manual aktif");
  assert.equal(sql('SELECT "manualFlat" FROM "ShippingSettings";'), "19000");
  await page.screenshot({ path: "test-results/shipping-settings-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto(base + "/admin/integrations/jnt");
  await expect(page.getByRole("heading", { name: "Integrasi J&T Express", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan Konfigurasi", exact: true })).toBeEnabled();
  await page.screenshot({ path: "test-results/shipping-jnt-desktop.png", fullPage: true });
  pass("Shipping Manual rupiah validation, database persistence, activation gate and responsive admin UI");

  // The runner uses the seeded local admin, its own cart, and a synthetic manual payment account.
  sql(`INSERT INTO "Cart" ("id","userId","updatedAt") SELECT 'shipping-ci-cart', id, CURRENT_TIMESTAMP FROM "User" LIMIT 1;
    INSERT INTO "CartItem" ("id","cartId","variantId","quantity") SELECT 'shipping-ci-line','shipping-ci-cart',id,2 FROM "ProductVariant" LIMIT 1;
    INSERT INTO "BankAccount" ("id","bankName","accountNumber","accountHolder","displayName") VALUES ('shipping-ci-bank','Synthetic','0000000000','Synthetic','Synthetic');`);
  const address = { recipientName: "Synthetic Buyer", phone: "+6281234567890", line: "Jalan Sintetis nomor 1",
    provinceCode: province.code, cityCode: city.code, districtCode: district.code, villageCode: village.code,
    postalCode: village.postalCode || "12345" };
  const quote = async () => {
    const response = await context.request.post(base + "/api/v1/checkout/preview", { headers, data: { address } });
    const payload = await response.json();
    assert.equal(response.status(), 200, JSON.stringify(payload));
    return payload.data;
  };
  const expected = await quote();
  const [option] = expected.shippingRates;
  assert.equal(option.courier, "Pengiriman Manual");
  assert.equal(option.cost, 19000);
  const checkout = { address, shipping: { courier: option.courier, service: option.service, quoteToken: option.quoteToken, cost: 0 },
    bankAccountId: "shipping-ci-bank", requestId: randomUUID(), expectedLines: expected.lines,
    expectedQuote: { subtotal: expected.subtotal, shippingCost: 19000, discount: 0, total: expected.subtotal + 19000 } };
  const placed = await context.request.post(base + "/api/v1/orders", { headers, data: checkout });
  const placedData = await placed.json();
  assert.equal(placed.status(), 201, JSON.stringify(placedData));
  assert.equal(placedData.data.shippingCost, 19000);
  assert.equal(placedData.data.shippingMode, "manual");
  assert.equal(placedData.data.total, expected.subtotal + 19000);
  assert.equal((await put(settings, { method: "manual", cost: 0 })).status(), 200);
  assert.equal(sql('SELECT "shippingCost" FROM "Order";'), "19000");
  const replay = await context.request.post(base + "/api/v1/orders", { headers, data: checkout });
  assert.equal(replay.status(), 201);
  assert.equal((await replay.json()).data.id, placedData.data.id);
  sql(`INSERT INTO "CartItem" ("id","cartId","variantId","quantity") SELECT 'shipping-ci-free','shipping-ci-cart',id,1 FROM "ProductVariant" LIMIT 1;`);
  assert.equal((await quote()).shippingRates[0].cost, 0);
  pass("Manual checkout charges once per two-item order, ignores submitted price, preserves snapshot and safely replays");

  const upload = (data, opts) => context.request.post(mapping, {
    headers: { ...headers, "Content-Type": "application/octet-stream", "x-jnt-mapping-options": encodeURIComponent(JSON.stringify(opts)) },
    data,
  });
  const encode = values => values.map(value => '"' + value.replaceAll('"', '""') + '"').join(",");
  const labels = ["Prop", "Kab", "Kec", "Kode", "Asal Tarif", "Asal Order", "Tujuan Tarif", "Tujuan Order", "Area Order"];
  const dataRow = [province.name, city.name, district.name, district.code, "SYNTH ORIGIN", "SYN", "SYNTH DEST", "TST", "SYN0001"];
  const data = Buffer.from(encode(labels) + "\n" + encode(dataRow) + "\n");
  const opts = { filename: "synthetic.csv", headerRow: 1, columns: { province: 0, city: 1, district: 2, districtCode: 3,
    sendSiteCode: 4, originCityCode: 5, destAreaCode: 6, destinationCityCode: 7, receiverArea: 8 } };
  async function stage(file, source) {
    const response = await upload(file, opts);
    assert.equal(response.status(), 200);
    const { data } = await response.json();
    assert.equal(data.report.valid, 1);
    const staged = await upload(file, { ...opts, stage: { reviewedVersion: data.version, source, official: true } });
    assert.equal(staged.status(), 200);
    return data.version;
  }
  const first = await stage(data, "Synthetic test in disposable CI");
  assert.notEqual(sql('SELECT "activeVersion" FROM "JntMappingRelease";'), first);
  assert.equal((await put(mapping, { version: first, confirm: true })).status(), 200);
  const second = await stage(Buffer.from(data.toString().replace("SYNTH DEST", "SYNTH OTHER")), "Synthetic replacement in disposable CI");
  assert.equal((await put(mapping, { version: second, confirm: true })).status(), 200);
  assert.equal((await put(mapping, { version: first, confirm: true })).status(), 200);
  assert.equal(sql('SELECT "activeVersion" FROM "JntMappingRelease";'), first);
  pass("Authorized dashboard API validates, stages, activates and rolls back separate synthetic mapping versions");

  const csv = Buffer.from("Synthetic header\n" + ("SYNTHETIC".repeat(17) + "\n").repeat(12_000));
  const xlsx = execFileSync("python3", ["-c", `
import io, sys, zipfile
out=io.BytesIO()
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as book:
    book.writestr('xl/workbook.xml', '<workbook xmlns:r="urn:rels"><sheets><sheet name="Synthetic" r:id="1"/></sheets></workbook>')
    book.writestr('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="1" Target="worksheets/sheet1.xml"/></Relationships>')
    rows=''.join(f'<row r="{i}"><c r="A{i}" t="inlineStr"><is><t>{"SYNTHETIC"*40}</t></is></c></row>' for i in range(1,12002))
    book.writestr('xl/worksheets/sheet1.xml', '<worksheet><sheetData>'+rows+'</sheetData></worksheet>')
sys.stdout.buffer.write(out.getvalue())
`]);
  const metrics = [];
  for (const [filename, file] of [["synthetic-limit.csv", csv], ["synthetic-limit.xlsx", xlsx]]) {
    const started = performance.now();
    const response = await upload(file, { filename, headerRow: 1 });
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).data.report.total, 12_000);
    const elapsedMs = Math.round(performance.now() - started);
    const ready = await context.request.get(base + "/api/v1/ready");
    assert.equal(ready.status(), 200);
    const cgroup = dc(["exec", "-T", "app", "cat", "/sys/fs/cgroup/memory.peak"]);
    metrics.push({ filename, bytes: file.length, rows: 12_000, elapsedMs, appContainerPeakBytes: Number(cgroup) });
  }
  writeFileSync("test-results/shipping-import-resources.json", JSON.stringify(metrics, null, 2));
  console.log("Synthetic import measurements", metrics);
  pass("Bounded 12,000-row CSV and XLSX previews, peak app container memory, and readiness after import");
}
