/** Real PostgreSQL upgrade/restore rehearsal. Never accepts a production target. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/node_modules/@prisma/client");
const admin = new URL(
  process.env.PROMOTION_RELEASE_TEST_DATABASE_URL || "http://invalid",
);
assert(
  ["127.0.0.1", "localhost"].includes(admin.hostname) &&
    admin.port === "5557" &&
    admin.pathname === "/postgres",
  "Dedicated local PostgreSQL 5557 required",
);
const pg = process.env.PROMOTION_TEST_PG_BIN;
assert(pg, "PROMOTION_TEST_PG_BIN required");
const bin = (name) =>
  join(pg, name + (process.platform === "win32" ? ".exe" : ""));
const legacy = process.env.PROMOTION_LEGACY_LEDGER === "yes";
const out = resolve("promotion-evidence/" + (legacy ? "release-upgrade-legacy" : "release-upgrade"));
mkdirSync(out, { recursive: true });
const archive = resolve(process.env.PROMOTION_BASELINE_ARCHIVE || "");
const digest = (p) =>
  createHash("sha256").update(readFileSync(p)).digest("hex");
assert.equal(
  digest(archive),
  "0a286296c0c85e5e320f85043e85dede0213e013dae129351a374df35f586b4e",
  "Published v1.7.4 artifact digest",
);
const old = join(out, "v174-prisma");
mkdirSync(old, { recursive: true });
execFileSync("tar", ["-xf", archive, "-C", old, "app/prisma"], {
  windowsHide: true,
});
const baseline = join(old, "app/prisma");
// Only the synthetic pre-upgrade fixture receives authenticated original bytes.
// Candidate/repository/runtime historical files and the Prisma ledger are never edited.
const legacyPairs = {
  "20261109120000_order_resolution_workflow": "789ef757b2cb2fb6f6d38f710c6a50cfcb371d9b61e18e4154120930e02107ac",
  "20261109121500_resolution_transfer_review": "d67b0094191575be2f28c7968e41eabad5bf9a9ab84676d8c66b7e7c01313483",
};
if (legacy) for (const [name, hash] of Object.entries(legacyPairs)) {
  const original = resolve("tests/fixtures/historical-eol", name + ".bin");
  assert.equal(digest(original), hash);
  const canonical = join(baseline, "migrations", name, "migration.sql");
  assert.equal(readFileSync(original).toString().replaceAll("\r\n", "\n"), readFileSync(canonical).toString());
  writeFileSync(canonical, readFileSync(original));
}
const suffix = randomUUID().slice(0, 8),
  names = ["upgrade", "restore", "lock", "other"].map(
    (n) => "hubify_promotions_" + n + "_" + suffix,
  );
const url = (name) => {
  const u = new URL(admin);
  u.pathname = "/" + name;
  return u.href;
};
const client = (name) =>
  new PrismaClient({ datasources: { db: { url: url(name) } } });
const args = () => [
  "-h",
  admin.hostname,
  "-p",
  admin.port,
  "-U",
  admin.username || "postgres",
];
const run = (exe, a) =>
  execFileSync(exe, a, {
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
const dbs = [];
function migrateEnv(name, schema) {
  return execFileSync(
    process.execPath,
    [
      resolve("app/node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      schema,
    ],
    {
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      env: { ...process.env, DATABASE_URL: url(name), DIRECT_URL: url(name) },
    },
  );
}
const tables = [
  "Product",
  "ProductVariant",
  "Inventory",
  "FlashSaleCampaign",
  "FlashSaleCampaignItem",
  "FlashSaleControl",
  "Coupon",
  "Order",
  "OrderItem",
];
async function snapshot(db) {
  const result = {};
  for (const t of tables) {
    const key = t === "FlashSaleControl" ? "key" : "id";
    result[t] = await db.$queryRawUnsafe(
      `SELECT to_jsonb(t)${t === "FlashSaleCampaign" ? "-'draft'" : t === "OrderItem" ? "-'flashOfferId'" : ""} AS row FROM "${t}" t ORDER BY "${key}"`,
    );
  }
  return result;
}
async function seed(db) {
  const p = await db.product.create({
    data: {
      name: "Synthetic upgrade product",
      slug: "upgrade-" + suffix,
      basePrice: 50000,
      salePrice: 45000,
      variants: {
        create: [
          {
            sku: "UPGRADE-" + suffix + "-M",
            price: 50000,
            inventory: { create: { onHand: 20, reserved: 2 } },
          },
          {
            sku: "UPGRADE-" + suffix + "-L",
            price: 70000,
            salePrice: 65000,
            inventory: { create: { onHand: 12 } },
          },
        ],
      },
    },
    select: { id: true, variants: { select: { id: true } } },
  });
  const user = await db.user.create({
    data: {
      name: "Synthetic upgrade buyer",
      email: suffix + "@example.test",
      passwordHash: "disabled-test",
    },
    select: { id: true },
  });
  await db.coupon.create({
    data: {
      code: "UPGRADE_" + suffix.toUpperCase(),
      discountType: "PERCENT",
      discountValue: 10,
      minSpend: 10000,
      maxDiscount: 10000,
      usageLimit: 10,
      perUserLimit: 2,
      isActive: true,
    },
    select: { id: true },
  });
  await db.coupon.create({
    data: {
      code: "FIXED_" + suffix.toUpperCase(),
      discountType: "FIXED",
      discountValue: 5000,
      minSpend: 0,
      maxDiscount: 1000,
      isActive: false,
    },
    select: { id: true },
  });
  const now = Date.now();
  for (const [n, status, offset] of [
    ["draft", "DRAFT", 0],
    ["running", "SCHEDULED", -3600000],
    ["future", "SCHEDULED", 86400000],
    ["ended", "ENDED", -86400000],
    ["cancelled", "CANCELLED", 172800000],
  ]) {
    await db.flashSaleCampaign.create({
      data: {
        id: randomUUID(),
        name: "Synthetic " + n,
        status,
        startsAt: new Date(now + offset),
        endsAt: new Date(now + offset + 7200000),
        items: {
          create: { id: randomUUID(), productId: p.id, flashSalePrice: 40000 },
        },
      },
      select: { id: true },
    });
  }
  for (const [i, status] of [
    "PAID",
    "PENDING_PAYMENT",
    "CANCELLED",
    "EXPIRED",
  ].entries()) {
    await db.order.create({
      data: {
        orderNumber: "SYN-" + suffix + "-" + i,
        userId: user.id,
        status,
        paymentStatus: status === "PAID" ? "PAID" : "PENDING_PAYMENT",
        subtotal: 40000,
        discount: 4000,
        total: 36000,
        couponCode: "UPGRADE_" + suffix.toUpperCase(),
        expiresAt: new Date(now + 3600000),
        items: {
          create: {
            variantId: p.variants[0].id,
            productName: "Snapshot unchanged",
            variantLabel: "Sage / M",
            quantity: 1,
            unitPrice: 40000,
            lineTotal: 40000,
          },
        },
      },
      select: { id: true },
    });
  }
  return p;
}
let result;
try {
  for (const name of names) {
    run(bin("createdb"), [...args(), name]);
    dbs.push(client(name));
  }
  const [name, restored, locked, other] = names,
    [db, restoredDb, lockedDb, otherDb] = dbs;
  for (const n of [name, locked, other])
    migrateEnv(n, join(baseline, "schema.prisma"));
  const p = await seed(db),
    before = await snapshot(db);
  const oldLedger = await db.$queryRawUnsafe(
    'SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
  );
  assert.equal(oldLedger.length, 29);
  if (legacy) for (const [name, hash] of Object.entries(legacyPairs))
    assert.equal(oldLedger.find(r => r.migration_name === name).checksum, hash);
  const dump = join(out, "synthetic-before.dump");
  run(bin("pg_dump"), [...args(), "-d", name, "-Fc", "-f", dump]);
  const began = performance.now();
  migrateEnv(name, resolve("app/prisma/schema.prisma"));
  const elapsedMs = Math.round(performance.now() - began);
  assert.deepEqual(
    await snapshot(db),
    before,
    "All pre-existing campaign/voucher/order/SKU values unchanged",
  );
  const afterLedger = await db.$queryRawUnsafe(
    'SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
  );
  assert.deepEqual(
    afterLedger.slice(0, 29),
    oldLedger,
    "Historical ledger unchanged",
  );
  assert.equal(afterLedger.length, 30);
  assert.equal(await db.flashSaleSkuOffer.count(), 0);
  assert.equal(
    await db.orderItem.count({ where: { flashOfferId: { not: null } } }),
    0,
  );
  assert.equal(
    (
      await db.$queryRawUnsafe(
        'SELECT count(*) AS count FROM "FlashSaleCampaign" WHERE draft IS NOT NULL',
      )
    )[0].count,
    0n,
  );
  const constraints = await db.$queryRawUnsafe(
    `SELECT conname,contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('"FlashSaleSkuOffer"'::regclass,'"OrderItem"'::regclass) ORDER BY conname`,
  );
  assert(
    constraints.some(
      (c) => c.contype === "c" && c.definition.includes("quota > 0"),
    ),
  );
  assert(
    constraints.filter(
      (c) => c.contype === "f" && c.definition.includes("FlashSaleSkuOffer"),
    ).length >= 1,
  );
  assert(
    constraints.some(
      (c) => c.contype === "c" && c.definition.includes("price > 0"),
    ),
  );
  const indexes = await db.$queryRawUnsafe(
    `SELECT indexname,indexdef FROM pg_indexes WHERE tablename IN ('FlashSaleSkuOffer','OrderItem') ORDER BY indexname`,
  );
  assert(
    indexes.some(
      (i) =>
        i.indexname === "FlashSaleSkuOffer_itemId_variantId_key" &&
        i.indexdef.includes("UNIQUE"),
    ),
  );
  const columns = await db.$queryRawUnsafe(
    `SELECT table_name,column_name,is_nullable,column_default,data_type FROM information_schema.columns WHERE (table_name='FlashSaleCampaign' AND column_name='draft') OR (table_name='OrderItem' AND column_name='flashOfferId') ORDER BY table_name`,
  );
  assert.equal(columns.length, 2);
  assert(
    columns.every((c) => c.is_nullable === "YES" && c.column_default === null),
  );
  const rls = await db.$queryRawUnsafe(
    `SELECT relrowsecurity FROM pg_class WHERE oid='"FlashSaleSkuOffer"'::regclass`,
  );
  assert(rls[0].relrowsecurity);
  // A second store database cannot look up or reference this store's product/SKU.
  assert.equal(await otherDb.product.count({ where: { id: p.id } }), 0);
  run(bin("pg_restore"), [
    ...args(),
    "-d",
    restored,
    "--no-owner",
    "--no-privileges",
    dump,
  ]);
  assert.deepEqual(
    await snapshot(restoredDb),
    before,
    "Paired pre-upgrade DB backup restores exact snapshots",
  );
  // Lock contention must fail the migration before any partial DDL remains.
  let release;
  const hold = new Promise((r) => (release = r));
  let acquired;
  const ready = new Promise((r) => (acquired = r));
  const holder = lockedDb.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        'LOCK TABLE "OrderItem" IN ACCESS EXCLUSIVE MODE',
      );
      acquired();
      await hold;
    },
    { timeout: 20000 },
  );
  await ready;
  let failure = "";
  const lockBegan = performance.now();
  try {
    migrateEnv(locked, resolve("app/prisma/schema.prisma"));
  } catch (e) {
    failure = String(e.stdout || "") + String(e.stderr || "");
  } finally {
    release();
    await holder;
  }
  const lockElapsedMs = Math.round(performance.now() - lockBegan);
  assert(
    failure.includes("lock timeout") ||
      failure.includes("current transaction is aborted"),
    "Migration rejects the locked table",
  );
  assert(
    lockElapsedMs >= 3000 && lockElapsedMs < 15000,
    "Failure occurs at the bounded lock wait",
  );
  // Prisma 5.22 can report its failed attempt to write migration logs inside the
  // aborted transaction. Preserve that diagnostic and the failed ledger entry.
  // The PostgreSQL server log carries the original 55P03 lock-timeout cause.
  const partial = await lockedDb.$queryRawUnsafe(
    `SELECT to_regclass('"FlashSaleSkuOffer"')::text AS offer, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='FlashSaleCampaign' AND column_name='draft') AS draft`,
  );
  assert.deepEqual(
    partial,
    [{ offer: null, draft: false }],
    "Failed transaction leaves no partial schema",
  );
  const failedLedger = await lockedDb.$queryRawUnsafe(
    `SELECT migration_name,finished_at IS NULL AS unfinished FROM "_prisma_migrations" WHERE migration_name='20261112050000_promotion_sku_offers'`,
  );
  assert(
    failedLedger[0]?.unfinished,
    "Prisma failure remains visible; no ledger repair is performed",
  );
  result = {
    ok: true,
    baseline: legacy ? "actual-v1.7.3-c67-equivalent-v1.7.4-legacy-ledger" : "v1.7.4",
    legacyLedger: legacy,
    prismaVersion: require("../app/node_modules/prisma/package.json").version,
    baselineArtifactSha256: digest(archive),
    newMigration: "20261112050000_promotion_sku_offers",
    newMigrationSha256: digest(
      resolve(
        "app/prisma/migrations/20261112050000_promotion_sku_offers/migration.sql",
      ),
    ),
    beforeMigrations: 29,
    afterMigrations: 30,
    elapsedMs,
    lockElapsedMs,
    lockFailure: failure.trim(),
    unchangedTables: tables,
    existingSnapshots: 4,
    legacyCampaigns: 5,
    checks: [
      "upgrade preserves all existing rows and 29 ledger records",
      "new nullable fields are null; no automatic SKU activation or backfill",
      "positive checks, unique index, FK and RLS retained",
      "representative pending/paid/cancelled/expired snapshots preserved",
      "custom-format backup restored into separate local database",
      "store product IDs absent in independent database",
      "lock timeout rolls back entire migration; failed Prisma record is retained",
    ],
    columns,
    constraints,
    indexes,
    backupSha256: digest(dump),
    productionTouched: false,
  };
  writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await Promise.all(dbs.map((d) => d.$disconnect()));
  // These exact random names were created by this invocation, on the guarded local cluster.
  for (const name of names) run(bin("dropdb"), [...args(), name]);
}
