import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Writable } from "node:stream";
// Use React18's streaming renderer: its legacy renderer uses __proto__, which
// is deliberately blocked by the existing hardened test runner.
const require = createRequire(import.meta.url);
const { renderToPipeableStream } = require(
  join(
    dirname(require.resolve("react-dom/package.json")),
    "cjs/react-dom-server.node.development.js",
  ),
) as typeof import("react-dom/server");
function renderToString(
  element: import("react").ReactElement,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = "";
    const output = new Writable({
      write(chunk, _encoding, done) {
        html += chunk.toString();
        done();
      },
    });
    output.on("finish", () => resolve(html));
    const stream = renderToPipeableStream(element, {
      onAllReady() {
        stream.pipe(output);
      },
      onError: reject,
    });
  });
}
import { FlashSaleTimer } from "@/components/storefront/flash-sale-timer";
import { matchesLegacyArchive } from "@/modules/promotions/legacy-flash-policy";
import {
  campaignInputSchema,
  campaignProductQuerySchema,
  campaignState,
  wibInputToIso,
  isoToWibInput,
} from "@/modules/promotions/campaign.validation";
import { productInputSchema } from "@/modules/catalog/product-management.validation";
const campaign = () => ({
  id: null,
  expectedVersion: 0,
  name: "Akhir Bulan",
  status: "SCHEDULED",
  startsAt: "2030-01-01T01:00:00Z",
  endsAt: "2030-01-02T01:00:00Z",
  items: [
    { productId: "p1", flashSalePrice: 17000 },
    { productId: "p2", flashSalePrice: 15000 },
  ],
});
describe("central Flash Sale contract", () => {
  it("one campaign has one interval and different per-product prices", () => {
    expect(campaignInputSchema.parse(campaign()).items).toHaveLength(2);
  });
  it("rejects item schedules, client tenant scope and foreign keys", () => {
    for (const extra of [
      { storeKey: "another" },
      { isFlashSale: true },
      { tenantId: "x" },
    ])
      expect(
        campaignInputSchema.safeParse({ ...campaign(), ...extra }).success,
      ).toBe(false);
    expect(
      campaignInputSchema.safeParse({
        ...campaign(),
        items: [{ productId: "p1", flashSalePrice: 1, endsAt: "2030-01-01" }],
      }).success,
    ).toBe(false);
  });
  it("requires distinct participants and bounded integral prices", () => {
    expect(
      campaignInputSchema.safeParse({
        ...campaign(),
        items: [campaign().items[0], campaign().items[0]],
      }).success,
    ).toBe(false);
    for (const price of [0, -1, 1.5, 2147483648, Infinity, NaN])
      expect(
        campaignInputSchema.safeParse({
          ...campaign(),
          items: [{ productId: "p", flashSalePrice: price }],
        }).success,
      ).toBe(false);
  });
  it("bounds names, item counts, versions and IDs", () => {
    for (const extra of [
      { name: "x" },
      { name: "x".repeat(121) },
      { expectedVersion: -1 },
      { expectedVersion: 1.2 },
      { id: "foreign" },
      { items: [] },
      {
        items: Array.from({ length: 201 }, (_, i) => ({
          productId: String(i),
          flashSalePrice: 1,
        })),
      },
    ])
      expect(
        campaignInputSchema.safeParse({ ...campaign(), ...extra }).success,
      ).toBe(false);
  });
  it("requires positive absolute intervals and explicit legacy scheduling acknowledgement", () => {
    expect(
      campaignInputSchema.safeParse({
        ...campaign(),
        endsAt: campaign().startsAt,
      }).success,
    ).toBe(false);
    expect(
      campaignInputSchema.safeParse({ ...campaign(), startsAt: "not-a-date" })
        .success,
    ).toBe(false);
    expect(
      campaignInputSchema.safeParse({
        ...campaign(),
        status: "DRAFT",
        resolveLegacy: true,
      }).success,
    ).toBe(false);
  });
  it("supports more than twenty-four hours", () => {
    expect(
      campaignInputSchema.safeParse({
        ...campaign(),
        endsAt: "2030-01-05T01:00:00Z",
      }).success,
    ).toBe(true);
  });
  it("defines inclusive start and exclusive end", () => {
    const c = campaign();
    expect(campaignState(c, Date.parse(c.startsAt) - 1)).toBe("UPCOMING");
    expect(campaignState(c, Date.parse(c.startsAt))).toBe("ACTIVE");
    expect(campaignState(c, Date.parse(c.endsAt))).toBe("ENDED");
  });
  it("never advertises drafts or cancelled/ended campaigns as active", () => {
    for (const status of ["DRAFT", "CANCELLED", "ENDED"])
      expect(
        campaignState(
          { ...campaign(), status },
          Date.parse(campaign().startsAt) + 1,
        ),
      ).toBe(status);
  });
  it("converts WIB independently of browser timezone, including date rollover", () => {
    expect(wibInputToIso("2030-01-01T01:30")).toBe("2029-12-31T18:30:00.000Z");
    expect(isoToWibInput("2029-12-31T18:30:00Z")).toBe("2030-01-01T01:30:00");
  });
  it("rejects impossible dates and ambiguous date inputs", () => {
    for (const value of [
      "2030-02-30T09:00",
      "2030-01-01 09:00",
      "2030-01-01T25:00",
      "",
      "2030-01-01T09:00Z",
    ])
      expect(() => wibInputToIso(value)).toThrow();
  });
  it("bounds server product search and rejects tenant/query injection", () => {
    expect(
      campaignProductQuerySchema.parse({ search: "  dress  " }).search,
    ).toBe("dress");
    for (const value of [
      { page: 0 },
      { page: 1.5 },
      { page: 100001 },
      { search: "x".repeat(161) },
      { storeKey: "other" },
      { search: { sql: "injection" } },
    ])
      expect(campaignProductQuerySchema.safeParse(value).success).toBe(false);
  });
  it("product payload rejects every legacy/campaign mutation field, including false and null", () => {
    const product = {
      name: "Example",
      slug: "example",
      basePrice: 20000,
      variants: [{ sku: "P1", onHand: 2 }],
      images: [],
    };
    expect(productInputSchema.safeParse(product).success).toBe(true);
    expect(
      productInputSchema.safeParse({
        ...product,
        variants: [{ ...product.variants[0], flashSalePrice: null }],
      }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...product,
        imported: [{ campaignId: "foreign" }],
      }).success,
    ).toBe(false);

    for (const [key, value] of Object.entries({
      isFlashSale: false,
      flashSalePrice: null,
      flashSaleStartsAt: "2030-01-01",
      flashSaleEndsAt: "2030-01-02",
      campaignId: "foreign",
      campaignItems: [],
    }))
      expect(
        productInputSchema.safeParse({ ...product, [key]: value }).success,
      ).toBe(false);
  });
  it("renders a deterministic SSR timer over24 hours from the campaign deadline", async () => {
    const c = {
      ...campaign(),
      id: "fixture",
      version: 0,
      endsAt: "2030-01-03T01:00:00Z",
      serverNow: Date.parse("2030-01-01T01:00:00Z"),
    };
    const html = await renderToString(
      createElement(FlashSaleTimer, { campaign: c }),
    );
    expect(html).toContain("48:00:00");
    expect(html).toContain('data-deadline="2030-01-03T01:00:00Z"');
  });
  it("does not derive SSR countdown from the client clock", async () => {
    const c = {
      ...campaign(),
      id: "fixture",
      version: 0,
      serverNow: Date.parse("2030-01-01T01:00:00Z"),
    };
    const original = await renderToString(
      createElement(FlashSaleTimer, { campaign: c }),
    );
    const spy = vi.spyOn(Date, "now").mockReturnValue(0);
    try {
      expect(
        await renderToString(createElement(FlashSaleTimer, { campaign: c })),
      ).toBe(original);
    } finally {
      spy.mockRestore();
    }
  });
  it("never emits a negative timer for ended/cancelled campaigns", async () => {
    const c = {
      ...campaign(),
      id: "fixture",
      version: 0,
      status: "ENDED",
      serverNow: Date.parse("2030-01-03T01:00:00Z"),
    };
    expect(
      await renderToString(createElement(FlashSaleTimer, { campaign: c })),
    ).toContain("00:00:00");
  });
  it("compares legacy timestamp-without-timezone archive values explicitly as UTC", () => {
    const p = {
      isFlashSale: false,
      salePrice: null,
      flashSalePrice: 1,
      flashSaleStartsAt: new Date("2030-01-01T01:00:00Z"),
      flashSaleEndsAt: new Date("2030-01-01T02:00:00Z"),
    };
    expect(
      matchesLegacyArchive(
        {
          ...p,
          flashSaleStartsAt: "2030-01-01T01:00:00",
          flashSaleEndsAt: "2030-01-01T02:00:00",
        },
        p,
      ),
    ).toBe(true);
    expect(matchesLegacyArchive({ ...p, flashSalePrice: 2 }, p)).toBe(false);
  });
});
