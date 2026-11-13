/** Local-only representative baseline snapshot. Run seed on 31 migrations, then
 * verify after 32 or after restoring a pg_dump into the same isolated lab target. */
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const target = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  target.protocol !== "postgresql:" ||
  target.hostname !== "127.0.0.1" ||
  target.port !== "5568" ||
  ![
    "/hubify_payment_evidence_test",
    "/hubify_payment_evidence_restore_test",
  ].includes(target.pathname)
)
  throw new Error("Isolated local payment evidence DB required");
const db = new PrismaClient();
const prefix = "payment-migration-baseline";
async function snapshot() {
  const [orders, payments, items, history, inventory, coupons] =
    await Promise.all([
      db.order.findMany({
        where: { orderNumber: { startsWith: prefix } },
        orderBy: { id: "asc" },
      }),
      db.payment.findMany({
        where: { order: { orderNumber: { startsWith: prefix } } },
        orderBy: { id: "asc" },
      }),
      db.orderItem.findMany({
        where: { order: { orderNumber: { startsWith: prefix } } },
        orderBy: { id: "asc" },
      }),
      db.orderStatusHistory.findMany({
        where: { order: { orderNumber: { startsWith: prefix } } },
        orderBy: { id: "asc" },
      }),
      db.inventory.findMany({
        where: { variant: { sku: { startsWith: prefix } } },
        orderBy: { id: "asc" },
      }),
      db.coupon.findMany({
        where: { code: { startsWith: prefix } },
        orderBy: { id: "asc" },
      }),
    ]);
  return JSON.stringify({
    orders,
    payments,
    items,
    history,
    inventory,
    coupons,
  });
}
async function main() {
  const [mode, path] = process.argv.slice(2);
  if (!path || !["seed", "verify"].includes(mode))
    throw new Error(
      "Usage: tsx scripts/payment-evidence-rehearsal.ts seed|verify <local-snapshot-path>",
    );
  if (mode === "seed") {
    if (
      await db.order.count({ where: { orderNumber: { startsWith: prefix } } })
    )
      throw new Error("Baseline already seeded; do not overwrite evidence");
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: "Synthetic baseline",
          email: `${prefix}@example.test`,
          passwordHash: "disabled-login",
        },
      });
      const product = await tx.product.create({
        data: {
          name: "Synthetic baseline product",
          slug: prefix,
          basePrice: 20000,
          variants: {
            create: {
              sku: prefix,
              inventory: { create: { onHand: 20, reserved: 2 } },
            },
          },
        },
        include: { variants: true },
      });
      const bank = await tx.bankAccount.create({
        data: {
          bankName: "Synthetic bank",
          displayName: "Fixture only",
          accountNumber: "0000000000",
          accountHolder: "Fixture",
        },
      });
      for (const paid of [false, true]) {
        await tx.order.create({
          data: {
            orderNumber: `${prefix}-${paid ? "paid" : "pending"}`,
            userId: user.id,
            subtotal: 20000,
            shippingCost: 7000,
            discount: 1000,
            total: 26000,
            status: paid ? "PAID" : "PENDING_PAYMENT",
            paymentStatus: paid ? "PAID" : "PENDING_PAYMENT",
            expiresAt: new Date(Date.now() + 3600_000),
            items: {
              create: {
                variantId: product.variants[0].id,
                productName: "Immutable original name",
                variantLabel: "Original SKU",
                unitPrice: 20000,
                quantity: 1,
                lineTotal: 20000,
              },
            },
            payment: {
              create: {
                amount: 26000,
                status: paid ? "PAID" : "PENDING_PAYMENT",
                bankAccountId: bank.id,
              },
            },
            history: {
              create: {
                toStatus: paid ? "PAID" : "PENDING_PAYMENT",
                note: "Original history",
                createdBy: user.id,
              },
            },
          },
        });
      }
      await tx.coupon.create({
        data: {
          code: prefix,
          discountType: "PERCENT",
          discountValue: 10,
          minSpend: 10000,
        },
      });
    });
    const result = await snapshot();
    writeFileSync(path, result, { flag: "wx" });
    console.log(
      "Baseline snapshot sha256:",
      createHash("sha256").update(result).digest("hex"),
    );
  } else {
    const expected = readFileSync(path, "utf8"),
      actual = await snapshot();
    if (expected !== actual)
      throw new Error("Existing financial/inventory/history baseline changed");
    console.log(
      "Existing order/payment/SKU/inventory/coupon/history unchanged; sha256:",
      createHash("sha256").update(actual).digest("hex"),
    );
  }
}
main().finally(() => db.$disconnect());
