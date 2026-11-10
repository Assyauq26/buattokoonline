vi.mock("server-only", () => ({}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  productInputSchema,
  categoryInputSchema,
} from "@/modules/catalog/product-management.validation";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  product: { groupBy: vi.fn() },
  inventory: { aggregate: vi.fn() },
  order: {
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
    findMany: vi.fn(),
  },
}));
const storage = vi.hoisted(() => ({
  putObject: vi.fn(),
  getObject: vi.fn(),
  STORAGE_APP: "unit-test",
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/storage", () => storage);
import {
  createManagedProduct,
  updateManagedProduct,
  changeProductStatus,
  saveCategory,
} from "@/modules/catalog/product-management.service";
import { getSellerDashboard } from "@/modules/admin/dashboard.service";
import {
  validateProductImage,
  uploadProductImage,
  readManagedProductImage,
  MAX_IMAGE_BYTES,
} from "@/modules/catalog/product-images.service";

const actor = {
  id: "staff",
  isAdmin: true,
  permissions: Object.values(PERMISSIONS),
};
const input = () => ({
  name: "Kaos Toko",
  slug: "kaos-store",
  basePrice: 150000,
  variants: [{ sku: "SKU-BLK-M", onHand: 5 }],
});
beforeEach(() => {
  vi.clearAllMocks();
  db.product.groupBy.mockResolvedValue([]);
  db.inventory.aggregate.mockResolvedValue({
    _sum: { onHand: null, reserved: null },
    _count: { _all: 0 },
  });
  db.order.groupBy.mockResolvedValue([]);
  db.order.aggregate.mockResolvedValue({
    _sum: { total: null },
    _count: { _all: 0 },
  });
  db.order.findMany.mockResolvedValue([]);
});

describe("product validation", () => {
  it("normalizes draft input and does not accept status from a client", () => {
    const parsed = productInputSchema.parse({
      ...input(),
      name: " Kaos Toko ",
      status: "PUBLISHED",
    });
    expect(parsed.name).toBe("Kaos Toko");
    expect(parsed).not.toHaveProperty("status");
  });
  it.each([0, -1, 0.5, NaN, Infinity, 2147483648])(
    "rejects invalid price %s",
    (basePrice) =>
      expect(
        productInputSchema.safeParse({ ...input(), basePrice }).success,
      ).toBe(false),
  );
  it.each([-1, 1.2, Infinity])("rejects invalid stock %s", (onHand) =>
    expect(
      productInputSchema.safeParse({
        ...input(),
        variants: [{ sku: "GH", onHand }],
      }).success,
    ).toBe(false),
  );
  it("rejects duplicate SKU, duplicate variant ids, and image ids", () => {
    expect(
      productInputSchema.safeParse({
        ...input(),
        variants: [{ sku: "GH" }, { sku: "GH" }],
      }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...input(),
        variants: [
          { id: "same", sku: "A" },
          { id: "same", sku: "B" },
        ],
      }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...input(),
        images: [{ id: "same" }, { id: "same" }],
      }).success,
    ).toBe(false);
  });
  it.each(["../private", "Kaos Besar", "<script>", "bad--slug"])(
    "rejects unsafe slug %s",
    (slug) =>
      expect(productInputSchema.safeParse({ ...input(), slug }).success).toBe(
        false,
      ),
  );
  it("requires valid lower sale price and explicit variant base price for a variant discount", () => {
    expect(
      productInputSchema.safeParse({ ...input(), salePrice: 150000 }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...input(),
        variants: [{ sku: "A", salePrice: 100 }],
      }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({ ...input(), isFlashSale: true }).success,
    ).toBe(false);
  });
  it("rejects missing variants and excessive images", () => {
    expect(
      productInputSchema.safeParse({ ...input(), variants: [] }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...input(),
        images: Array.from({ length: 11 }, (_, i) => ({ id: String(i) })),
      }).success,
    ).toBe(false);
  });
  it("validates category slug and sort order", () => {
    expect(
      categoryInputSchema.safeParse({
        name: "Kaos",
        slug: "kaos",
        sortOrder: -1,
      }).success,
    ).toBe(false);
  });
});
describe("authorization before database/storage side effects", () => {
  it("rejects a customer even with a forged permission list", async () => {
    await expect(
      createManagedProduct({ ...actor, isAdmin: false }, input()),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("requires create, update, archive and category permissions separately", async () => {
    const readOnly = { ...actor, permissions: [PERMISSIONS.PRODUCT_READ] };
    await expect(createManagedProduct(readOnly, input())).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(
      updateManagedProduct(readOnly, "id", "version", input()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      changeProductStatus(readOnly, "id", "version", "ARCHIVED"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      saveCategory(readOnly, null, { name: "Kaos", slug: "kaos" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("requires inventory permissions for nonzero starting stock", async () => {
    await expect(
      createManagedProduct(
        { ...actor, permissions: [PERMISSIONS.PRODUCT_CREATE] },
        input(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects invalid input before a transaction and client IDs in new products", async () => {
    await expect(
      createManagedProduct(actor, { ...input(), basePrice: -1 }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      createManagedProduct(actor, {
        ...input(),
        variants: [{ id: "existing", sku: "A" }],
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects unauthorized image uploads without initializing storage", async () => {
    await expect(
      uploadProductImage(
        { ...actor, permissions: [] },
        "p",
        "v",
        new Uint8Array([1]),
        "image/png",
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(storage.putObject).not.toHaveBeenCalled();
  });
});
describe("dashboard data permissions", () => {
  it("does not query order, revenue or inventory for Marketing/product-only users", async () => {
    const result = await getSellerDashboard({
      ...actor,
      permissions: [PERMISSIONS.PRODUCT_READ],
    });
    expect(result.products?.total).toBe(0);
    expect(result.orders).toBeNull();
    expect(result.sales).toBeNull();
    expect(result.inventory).toBeNull();
    expect(db.order.count).not.toHaveBeenCalled();
    expect(db.order.groupBy).not.toHaveBeenCalled();
    expect(db.order.aggregate).not.toHaveBeenCalled();
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect(db.inventory.aggregate).not.toHaveBeenCalled();
  });
  it("shows empty real-data summaries without invented sales", async () => {
    const result = await getSellerDashboard(actor);
    expect(result.sales).toEqual({ amount: 0, count: 0 });
    expect(result.inventory?.available).toBe(0);
    expect(result.recent).toEqual([]);
  });
  it("rejects anonymous/nonstaff access before querying", async () => {
    await expect(
      getSellerDashboard({ ...actor, isAdmin: false }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.product.groupBy).not.toHaveBeenCalled();
  });
  it("requires both order and payment visibility for sales summaries", async () => {
    await getSellerDashboard({
      ...actor,
      permissions: [PERMISSIONS.PAYMENT_READ],
    });
    expect(db.order.aggregate).not.toHaveBeenCalled();
  });
});
describe("image validation and storage paths", () => {
  it.each(["image/svg+xml", "text/html", "application/pdf", "__proto__"])(
    "rejects %s",
    (mime) =>
      expect(() =>
        validateProductImage(new Uint8Array([255, 216, 255, 217]), mime),
      ).toThrow(),
  );
  it("rejects forged MIME, empty and oversized files", () => {
    expect(() =>
      validateProductImage(new Uint8Array([255, 216, 255, 217]), "image/png"),
    ).toThrow();
    expect(() =>
      validateProductImage(new Uint8Array(), "image/jpeg"),
    ).toThrow();
    expect(MAX_IMAGE_BYTES).toBe(4 * 1024 * 1024);
    expect(() =>
      validateProductImage(new Uint8Array(MAX_IMAGE_BYTES + 1), "image/jpeg"),
    ).toThrow();
    const atLimit = new Uint8Array(MAX_IMAGE_BYTES);
    atLimit.set([255, 216, 255, 217]);
    expect(validateProductImage(atLimit, "image/jpeg")).toBe("jpg");
  });
  it("accepts a JPEG header with matching type", () =>
    expect(
      validateProductImage(new Uint8Array([255, 216, 255, 217]), "image/jpeg"),
    ).toBe("jpg"));
  it("never reads a caller-chosen traversal or mismatched product path", async () => {
    await expect(
      readManagedProductImage({
        id: "id",
        productId: "p",
        url: "/api/v1/product-images/id?object=app/../secrets.png",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      readManagedProductImage({
        id: "id",
        productId: "p",
        url: "/api/v1/product-images/id?object=app/product-images/other/id.png",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(storage.getObject).not.toHaveBeenCalled();
  });
});
