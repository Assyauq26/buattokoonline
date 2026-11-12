import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
vi.mock("server-only", () => ({}));
import { prisma } from "@/lib/prisma";
import {
  saveCampaign,
  endCampaign,
  campaignProducts,
  listCampaigns,
} from "@/modules/promotions/campaign.service";
import {
  saveCampaignDraft,
  deleteCampaignDraft,
} from "@/modules/promotions/campaign-draft";
import { withCampaignPricing } from "@/modules/promotions/campaign-pricing";
import { readSkuOffers } from "@/modules/promotions/promotion-offers";
import {
  getCartView,
  getDirectCheckoutView,
} from "@/modules/cart/cart.service";
import {
  previewCheckout,
  createOrder,
} from "@/modules/checkout/checkout.service";
import { expireStaleOrders } from "@/modules/orders/orders.service";
import {
  saveVoucher,
  setVoucherActive,
  listMarketing,
} from "@/modules/promotions/marketing.service";
import { computeDiscount } from "@/modules/promotions/coupon.service";
import { getPurchaseOptions } from "@/modules/catalog/purchase-options.service";
import { effectiveProductPrice } from "@/modules/promotions/scheduled-flash-sale";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
const target = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  !["127.0.0.1", "localhost"].includes(target.hostname) ||
  target.port !== "5557" ||
  target.pathname !== "/hubify_promotions_test"
)
  throw Error("Disposable local promotions database required");
const prefix = "promo-" + randomUUID();
let actor: { id: string; isAdmin: boolean; permissions: string[] };
let bank: string;
let address: {
  recipientName: string;
  phone: string;
  line: string;
  provinceCode: string;
  cityCode: string;
  districtCode: string;
  villageCode: string;
  postalCode: string;
  city: string;
  province: string;
};
beforeAll(async () => {
  process.env.REGION_DATA_MODE = "snapshot";
  process.env.JWT_SECRET = randomBytes(32).toString("hex");
  process.env.APP_ORIGIN = "http://127.0.0.1:3124";
  const user = await prisma.user.create({
    data: {
      email: prefix + "@example.test",
      name: "Promotions operator",
      passwordHash: "disabled-local-test",
    },
  });
  actor = { id: user.id, isAdmin: true, permissions: ALL_PERMISSIONS };
  await prisma.flashSaleControl.upsert({
    where: { key: "primary" },
    create: { key: "primary" },
    update: {},
  });
  await prisma.shippingSettings.upsert({
    where: { id: 1 },
    create: { id: 1, manualFlat: 5000 },
    update: { manualFlat: 5000, activeJntId: null },
  });
  bank = (
    await prisma.bankAccount.create({
      data: {
        bankName: "Synthetic",
        accountNumber: randomUUID(),
        accountHolder: "Synthetic",
        displayName: "Synthetic",
      },
    })
  ).id;
  const snapshot = JSON.parse(
    gunzipSync(
      readFileSync("src/modules/regions/data/snapshot.json.gz"),
    ).toString(),
  );
  const p = snapshot.provinces.data[0],
    c = snapshot["regencies/" + p.code].data[0],
    d = snapshot["districts/" + c.code].data[0],
    v = snapshot["villages/" + d.code].data[0];
  address = {
    recipientName: "Synthetic buyer",
    phone: "+6281234567890",
    line: "Jalan uji nomor 1",
    provinceCode: p.code,
    cityCode: c.code,
    districtCode: d.code,
    villageCode: v.code,
    postalCode: v.postalCode || "",
    city: c.name,
    province: p.name,
  };
});
beforeEach(async () => {
  await prisma.flashSaleCampaign.updateMany({
    where: { name: { startsWith: prefix } },
    data: { status: "ENDED" },
  });
});
afterAll(() => prisma.$disconnect());
async function product() {
  return prisma.product.create({
    data: {
      name: prefix,
      slug: prefix + "-" + randomUUID(),
      basePrice: 20000,
      weightGrams: 500,
      variants: {
        create: [
          {
            sku: randomUUID(),
            color: "Sage",
            size: "M",
            price: 20000,
            inventory: { create: { onHand: 10 } },
          },
          {
            sku: randomUUID(),
            color: "Cream",
            size: "L",
            price: 30000,
            inventory: { create: { onHand: 8 } },
          },
        ],
      },
    },
    include: { variants: true },
  });
}
async function campaign(
  p: Awaited<ReturnType<typeof product>>,
  options: { future?: boolean; quota?: number } = {},
) {
  const start = new Date(Date.now() + (options.future ? 3600000 : -3600000)),
    end = new Date(start.getTime() + 7200000);
  return saveCampaign(actor, {
    id: null,
    expectedVersion: 0,
    name: prefix,
    status: "SCHEDULED",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    items: [
      {
        productId: p.id,
        flashSalePrice: 15000,
        skuOffers: [
          {
            variantId: p.variants[0].id,
            price: 15000,
            quota: options.quota ?? 1,
          },
        ],
      },
    ],
  });
}
async function buyer(p: Awaited<ReturnType<typeof product>>) {
  const user = await prisma.user.create({
    data: {
      name: "Synthetic buyer",
      email: randomUUID() + "@example.test",
      passwordHash: "disabled-local-test",
      cart: {
        create: {
          items: { create: { variantId: p.variants[0].id, quantity: 1 } },
        },
      },
    },
  });
  return user.id;
}
async function confirmed(user: string, couponCode?: string, intentId?: string) {
  const first = await previewCheckout(user, { address, couponCode, intentId });
  const shipping = first.shippingRates[0];
  const selected = await previewCheckout(user, {
    address,
    couponCode,
    shipping,
    intentId,
  });
  return {
    address,
    shipping,
    bankAccountId: bank,
    couponCode,
    intentId,
    requestId: randomUUID(),
    expectedLines: selected.lines,
    expectedQuote: {
      subtotal: selected.subtotal,
      shippingCost: selected.shippingCost,
      discount: selected.discount,
      total: selected.total,
    },
  };
}
it("persists an incomplete draft without making it a price authority", async () => {
  const d = await saveCampaignDraft(actor, {
    id: null,
    expectedVersion: 0,
    name: "",
    startsAt: null,
    endsAt: null,
    items: [],
  });
  const row = await prisma.flashSaleCampaign.findUniqueOrThrow({
    where: { id: d.id },
  });
  expect(row.status).toBe("DRAFT");
  expect(row.draft).toMatchObject({ name: "", startsAt: null, items: [] });
  await deleteCampaignDraft(actor, d.id, 0);
  expect(await prisma.flashSaleCampaign.count({ where: { id: d.id } })).toBe(0);
});
it("keeps invalid/incomplete times and prices in drafts but rejects publication", async () => {
  const p = await product();
  const d = await saveCampaignDraft(actor, {
    id: null,
    expectedVersion: 0,
    name: prefix,
    startsAt: "2030-01-02T00:00:00Z",
    endsAt: "2030-01-01T00:00:00Z",
    items: [
      {
        productId: p.id,
        skuOffers: [{ variantId: p.variants[0].id, price: null, quota: 0 }],
      },
    ],
  });
  expect(
    (await prisma.flashSaleCampaign.findUniqueOrThrow({ where: { id: d.id } }))
      .draft,
  ).toMatchObject({ endsAt: "2030-01-01T00:00:00Z" });
  await expect(
    saveCampaign(actor, {
      id: d.id,
      expectedVersion: 0,
      name: prefix,
      status: "SCHEDULED",
      startsAt: "2030-01-02T00:00:00Z",
      endsAt: "2030-01-01T00:00:00Z",
      items: [],
    }),
  ).rejects.toMatchObject({ status: 422 });
});
it("prices only selected SKUs and leaves regular catalog amounts intact", async () => {
  const p = await product();
  await campaign(p);
  const view = await getDirectCheckoutView(p.variants[0].id, 1);
  expect(view.lines[0].unitPrice).toBe(15000);
  expect(view.lines[0].flashOfferId).toBeTruthy();
  const other = await getDirectCheckoutView(p.variants[1].id, 1);
  expect(other.lines[0].unitPrice).toBe(30000);
  expect(other.lines[0].flashOfferId).toBeNull();
  const quick = await getPurchaseOptions(p.slug);
  expect(quick.variants.find((v) => v.id === p.variants[0].id)).toMatchObject({
    price: 15000,
    available: 1,
  });
  expect(quick.variants.find((v) => v.id === p.variants[1].id)).toMatchObject({
    price: 30000,
    available: 8,
  });
  expect(
    (await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).basePrice,
  ).toBe(20000);
});
it("uses an available SKU price for catalog summaries when the promoted SKU costs more than the product base", async () => {
  const p = await product();
  await prisma.inventory.update({
    where: { variantId: p.variants[0].id },
    data: { onHand: 0 },
  });
  await saveCampaign(actor, {
    id: null,
    expectedVersion: 0,
    name: prefix,
    status: "SCHEDULED",
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    items: [
      {
        productId: p.id,
        flashSalePrice: 25000,
        skuOffers: [{ variantId: p.variants[1].id, price: 25000, quota: 2 }],
      },
    ],
  });
  const [priced] = await withCampaignPricing([p]);
  expect(priced.promotionCard).toMatchObject({
    price: 25000,
    originalPrice: 30000,
  });
  expect(effectiveProductPrice(priced)).toBe(25000);
  expect(
    (await getDirectCheckoutView(p.variants[1].id, 1)).lines[0].unitPrice,
  ).toBe(25000);
  await prisma.inventory.update({
    where: { variantId: p.variants[0].id },
    data: { onHand: 10 },
  });
  const [cheaper] = await withCampaignPricing([p]);
  expect(cheaper.promotionCard).toMatchObject({
    price: 20000,
    originalPrice: 20000,
  });
  expect(effectiveProductPrice(cheaper)).toBe(20000);
  expect(
    (await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).basePrice,
  ).toBe(20000);
});
it("rejects foreign SKU identity, quota above available inventory and invalid SKU prices", async () => {
  const p = await product(),
    other = await product();
  for (const offer of [
    { variantId: other.variants[0].id, price: 10000, quota: 1 },
    { variantId: p.variants[0].id, price: 15000, quota: 11 },
    { variantId: p.variants[0].id, price: 20000, quota: 1 },
  ])
    await expect(
      saveCampaign(actor, {
        id: null,
        expectedVersion: 0,
        name: prefix,
        status: "SCHEDULED",
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
        items: [
          { productId: p.id, flashSalePrice: offer.price, skuOffers: [offer] },
        ],
      }),
    ).rejects.toMatchObject({ status: 422 });
});
it("enforces permissions before revealing identities", async () => {
  await expect(
    saveCampaign({ ...actor, isAdmin: false }, { id: randomUUID() }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    campaignProducts({ ...actor, permissions: [] }, { ids: ["other"] }),
  ).rejects.toMatchObject({ status: 403 });
});
it("does not permit editing or deleting a campaign that has started", async () => {
  const p = await product(),
    c = await campaign(p);
  await expect(
    saveCampaign(actor, {
      id: c.id,
      expectedVersion: 0,
      name: prefix,
      status: "DRAFT",
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
      items: [{ productId: p.id, flashSalePrice: 14000 }],
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(deleteCampaignDraft(actor, c.id, 0)).rejects.toMatchObject({
    status: 409,
  });
  await endCampaign(actor, { id: c.id, expectedVersion: 0 });
  expect(
    (await getDirectCheckoutView(p.variants[0].id, 1)).lines[0].unitPrice,
  ).toBe(20000);
});
it("uses start-inclusive/end-exclusive prices without relying on scheduler", async () => {
  const p = await product(),
    c = await campaign(p, { future: true });
  const row = await prisma.flashSaleCampaign.findUniqueOrThrow({
    where: { id: c.id },
  });
  expect(
    await readSkuOffers([p.id], prisma, new Date(row.startsAt.getTime() - 1)),
  ).toHaveLength(0);
  expect(await readSkuOffers([p.id], prisma, row.startsAt)).toHaveLength(1);
  expect(await readSkuOffers([p.id], prisma, row.endsAt)).toHaveLength(0);
  const [regular] = await withCampaignPricing([p], prisma, row.endsAt);
  expect(regular.flashSalePrice).toBeNull();
});
it("serializes the last SKU quota across two buyers and replays identical requests once", async () => {
  const p = await product();
  await campaign(p);
  const users = await Promise.all([buyer(p), buyer(p)]),
    requests = await Promise.all(users.map((u) => confirmed(u)));
  const result = await Promise.allSettled(
    users.map((u, i) => createOrder(u, requests[i])),
  );
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const winner = result.findIndex((r) => r.status === "fulfilled");
  const order = (
    result[winner] as PromiseFulfilledResult<
      Awaited<ReturnType<typeof createOrder>>
    >
  ).value;
  const line = await prisma.orderItem.findFirstOrThrow({
    where: { orderId: order.id },
  });
  expect(line.flashOfferId).toBeTruthy();
  expect(line.unitPrice).toBe(15000);
  expect((await createOrder(users[winner], requests[winner])).id).toBe(
    order.id,
  );
  expect(
    await prisma.orderItem.count({
      where: { flashOfferId: line.flashOfferId },
    }),
  ).toBe(1);
  expect((await getCartView(users[1 - winner])).lines[0].unitPrice).toBe(20000);
  expect(
    (
      await prisma.inventory.findUniqueOrThrow({
        where: { variantId: p.variants[0].id },
      })
    ).reserved,
  ).toBe(1);
});
it("releases expired-order quota through the existing lifecycle exactly once", async () => {
  const p = await product();
  await campaign(p);
  const u = await buyer(p),
    request = await confirmed(u),
    order = await createOrder(u, request);
  await prisma.order.update({
    where: { id: order.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await expireStaleOrders();
  await expireStaleOrders();
  expect(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("EXPIRED");
  expect((await readSkuOffers([p.id]))[0].available).toBe(1);
  expect(
    (
      await prisma.inventory.findUniqueOrThrow({
        where: { variantId: p.variants[0].id },
      })
    ).reserved,
  ).toBe(0);
  expect(
    (await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } }))
      .unitPrice,
  ).toBe(15000);
});
const voucher = () => ({
  code: randomUUID().replaceAll("-", "").slice(0, 20),
  discountType: "PERCENT",
  discountValue: 10,
  minSpend: 0,
  maxDiscount: 2000,
  startsAt: null,
  expiresAt: null,
  usageLimit: 1,
  perUserLimit: 1,
  isActive: true,
});
it("prevents duplicate draft creation when a timed-out request is retried", async () => {
  const requestId = randomUUID(),
    input = {
      id: null,
      requestId,
      expectedVersion: 0,
      name: prefix,
      startsAt: null,
      endsAt: null,
      items: [],
    };
  await saveCampaignDraft(actor, input);
  await expect(saveCampaignDraft(actor, input)).rejects.toMatchObject({
    status: 409,
  });
  expect(
    await prisma.flashSaleCampaign.count({ where: { id: requestId } }),
  ).toBe(1);
});
it("does not apply a hidden percentage cap on legacy fixed-value vouchers", async () => {
  const row = await prisma.coupon.create({
    data: {
      ...voucher(),
      code: randomUUID().toUpperCase(),
      discountType: "FIXED",
      discountValue: 5000,
      maxDiscount: 100,
    },
  });
  expect(
    (await computeDiscount(row.code, 10000, prisma, actor.id)).discount,
  ).toBe(5000);
});
it("normalizes fixed discounts and rejects duplicate codes", async () => {
  const input = {
    ...voucher(),
    code: " " + randomUUID().slice(0, 8).toLowerCase() + " ",
    discountType: "FIXED",
    discountValue: 5000,
    maxDiscount: 100,
  };
  const saved = await saveVoucher(actor, null, input),
    row = await prisma.coupon.findUniqueOrThrow({ where: { id: saved.id } });
  expect(row.code).toBe(input.code.trim().toUpperCase());
  expect(row.maxDiscount).toBeNull();
  expect(
    (await computeDiscount(row.code, 6000, prisma, actor.id)).discount,
  ).toBe(5000);
  await expect(saveVoucher(actor, null, input)).rejects.toMatchObject({
    status: 409,
  });
});
it("serializes last voucher redemption and preserves Flash Sale/order snapshots", async () => {
  const p = await product();
  await campaign(p, { quota: 5 });
  const saved = await saveVoucher(actor, null, voucher()),
    coupon = await prisma.coupon.findUniqueOrThrow({ where: { id: saved.id } });
  const users = await Promise.all([buyer(p), buyer(p)]),
    requests = await Promise.all(users.map((u) => confirmed(u, coupon.code)));
  expect(requests[0].expectedQuote.discount).toBe(1500);
  const results = await Promise.allSettled(
    users.map((u, i) => createOrder(u, requests[i])),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await setVoucherActive(actor, coupon.id, false);
  const order = (
    results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<typeof createOrder>>
    >
  ).value;
  expect(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .discount,
  ).toBe(1500);
  await expect(setVoucherActive(actor, coupon.id, true)).rejects.toMatchObject({
    status: 409,
  });
});
it("returns filtered pages from backend without truncating the catalog to the initial page", async () => {
  for (let i = 0; i < 15; i++)
    await saveCampaignDraft(actor, {
      id: null,
      expectedVersion: 0,
      name: prefix + " page " + i,
      startsAt: null,
      endsAt: null,
      items: [],
    });
  const first = await listCampaigns(actor, {
      page: 1,
      search: prefix + " page",
    }),
    second = await listCampaigns(actor, { page: 2, search: prefix + " page" });
  expect(first).toHaveLength(12);
  expect(second).toHaveLength(3);
  expect(new Set([...first, ...second].map((c) => c.id)).size).toBe(15);
  expect(
    (await listMarketing(actor, { page: 1, search: "never-matches-" + prefix }))
      .total,
  ).toBe(0);
});
it("accepts adjacent windows and rejects overlap under the existing global schedule policy", async () => {
  const p = await product();
  const starts = Date.now() + 3600000;
  const input = (start: number, end: number) => ({
    id: null,
    expectedVersion: 0,
    name: prefix,
    status: "SCHEDULED",
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    items: [
      {
        productId: p.id,
        flashSalePrice: 15000,
        skuOffers: [{ variantId: p.variants[0].id, price: 15000, quota: 2 }],
      },
    ],
  });
  await saveCampaign(actor, input(starts, starts + 3600000));
  await saveCampaign(actor, input(starts + 3600000, starts + 7200000));
  await expect(
    saveCampaign(actor, input(starts + 1800000, starts + 5400000)),
  ).rejects.toMatchObject({ status: 409 });
});
it("revalidates publication after product status or available stock changes", async () => {
  const p = await product();
  await prisma.product.update({
    where: { id: p.id },
    data: { status: "ARCHIVED" },
  });
  await expect(campaign(p)).rejects.toMatchObject({ status: 422 });
  await prisma.product.update({
    where: { id: p.id },
    data: { status: "PUBLISHED" },
  });
  await prisma.inventory.update({
    where: { variantId: p.variants[0].id },
    data: { reserved: 10 },
  });
  await expect(campaign(p)).rejects.toMatchObject({ status: 422 });
});
it("rejects browser-supplied promo amounts before stock or order writes", async () => {
  const p = await product();
  await campaign(p);
  const u = await buyer(p),
    request = await confirmed(u);
  const count = await prisma.order.count();
  await expect(
    createOrder(u, {
      ...request,
      expectedLines: request.expectedLines.map((l) => ({ ...l, unitPrice: 1 })),
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(await prisma.order.count()).toBe(count);
  expect(
    (
      await prisma.inventory.findUniqueOrThrow({
        where: { variantId: p.variants[0].id },
      })
    ).reserved,
  ).toBe(0);
});
it("handles concurrent identical requests without duplicate quota or stock reservations", async () => {
  const p = await product();
  await campaign(p);
  const u = await buyer(p),
    request = await confirmed(u);
  const result = await Promise.all([
    createOrder(u, request),
    createOrder(u, request),
  ]);
  expect(result[0].id).toBe(result[1].id);
  expect(
    await prisma.orderItem.count({ where: { orderId: result[0].id } }),
  ).toBe(1);
  expect(
    (
      await prisma.inventory.findUniqueOrThrow({
        where: { variantId: p.variants[0].id },
      })
    ).reserved,
  ).toBe(1);
});
it("serializes per-customer limits across independent Buy Now intents", async () => {
  const p = await product();
  await campaign(p, { quota: 5 });
  const c = await saveVoucher(actor, null, {
    ...voucher(),
    usageLimit: 10,
    perUserLimit: 1,
  });
  const row = await prisma.coupon.findUniqueOrThrow({ where: { id: c.id } });
  const u = await buyer(p);
  const intents = await Promise.all(
    [1, 2].map(() =>
      prisma.checkoutIntent.create({
        data: {
          userId: u,
          variantId: p.variants[0].id,
          quantity: 1,
          expiresAt: new Date(Date.now() + 3600000),
        },
      }),
    ),
  );
  const requests = await Promise.all(
    intents.map((i) => confirmed(u, row.code, i.id)),
  );
  const result = await Promise.allSettled(
    requests.map((r) => createOrder(u, r)),
  );
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await prisma.order.count({ where: { couponCode: row.code } })).toBe(1);
});
it("keeps inactive, scheduled, expired, minimum-spend and percentage-cap rules distinct", async () => {
  const input = {
    ...voucher(),
    usageLimit: null,
    perUserLimit: null,
    minSpend: 10000,
    discountValue: 50,
    maxDiscount: 3000,
  };
  const c = await saveVoucher(actor, null, input),
    row = await prisma.coupon.findUniqueOrThrow({ where: { id: c.id } });
  expect(
    (await computeDiscount(row.code, 9000, prisma, actor.id)).reason,
  ).toContain("minimum");
  expect(
    (await computeDiscount(row.code, 20000, prisma, actor.id)).discount,
  ).toBe(3000);
  await prisma.coupon.update({
    where: { id: row.id },
    data: { startsAt: new Date(Date.now() + 3600000) },
  });
  expect(
    (await computeDiscount(row.code, 20000, prisma, actor.id)).reason,
  ).toContain("belum mulai");
  await prisma.coupon.update({
    where: { id: row.id },
    data: { startsAt: null, expiresAt: new Date(Date.now() - 3600000) },
  });
  expect(
    (await computeDiscount(row.code, 20000, prisma, actor.id)).reason,
  ).toContain("kedaluwarsa");
  await prisma.coupon.update({
    where: { id: row.id },
    data: { isActive: false },
  });
  expect(
    (await computeDiscount(row.code, 20000, prisma, actor.id)).reason,
  ).toContain("tidak valid");
});
