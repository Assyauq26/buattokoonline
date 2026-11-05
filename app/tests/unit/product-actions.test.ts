vi.mock("@/lib/prisma", () => ({ prisma: { productVariant: { findMany: mocks.findSkus } } }));
vi.mock("@/modules/catalog/product-editor-session", () => ({ productEditorSessionHash: async () => "a".repeat(64) }));
import { beforeEach, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
const mocks = vi.hoisted(() => ({ findSkus: vi.fn(), permission: vi.fn(), create: vi.fn(), update: vi.fn(), status: vi.fn(), get: vi.fn(), category: vi.fn(), tag: vi.fn(), path: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requirePermission: mocks.permission }));
vi.mock("@/modules/catalog/product-management.service", () => ({ createManagedProduct: mocks.create, updateManagedProduct: mocks.update, changeProductStatus: mocks.status, getManagedProduct: mocks.get, saveCategory: mocks.category }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.tag, revalidatePath: mocks.path }));
import { saveProductAction, setProductStatusAction, saveCategoryAction, allocateProductSkusAction } from "@/modules/catalog/product-management.actions";
beforeEach(() => { vi.clearAllMocks(); mocks.permission.mockResolvedValue({ id: "staff", isAdmin: true, permissions: Object.values(PERMISSIONS) }); mocks.create.mockResolvedValue({ id: "product" }); mocks.get.mockResolvedValue({ id: "product" }); });
it("authenticates before parsing or performing product mutations", async () => {
  mocks.permission.mockRejectedValue(new HttpError("Forbidden", 403));
  expect((await saveProductAction(new FormData())).ok).toBe(false); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.tag).not.toHaveBeenCalled();
});
it("invalidates tagged catalogs and dynamic product paths after a successful save", async () => {
  const form = new FormData(); form.set("product", "{}");
  expect((await saveProductAction(form)).ok).toBe(true);
  expect(mocks.permission).toHaveBeenCalledWith(PERMISSIONS.PRODUCT_CREATE);
  expect(mocks.tag).toHaveBeenCalledWith("store-catalog"); expect(mocks.path).toHaveBeenCalledWith("/product/[slug]", "page");
});
it("does not invalidate caches when the transaction fails", async () => {
  mocks.create.mockRejectedValue(new HttpError("Duplicate SKU", 409)); const form = new FormData(); form.set("product", "{}");
  expect((await saveProductAction(form)).ok).toBe(false); expect(mocks.tag).not.toHaveBeenCalled();
});
it("uses archive permission for archive and update permission for publish", async () => {
  await setProductStatusAction("p", "v", "ARCHIVED"); expect(mocks.permission).toHaveBeenLastCalledWith(PERMISSIONS.PRODUCT_DELETE);
  await setProductStatusAction("p", "v", "PUBLISHED"); expect(mocks.permission).toHaveBeenLastCalledWith(PERMISSIONS.PRODUCT_UPDATE);
});
it("invalidates category/catalog caches after a category save", async () => {
  await saveCategoryAction(null, {}); expect(mocks.category).toHaveBeenCalled(); expect(mocks.tag).toHaveBeenCalledWith("store-catalog");
});

it("SKU generation requires a writer and validates bounded input", async () => {
 mocks.permission.mockResolvedValue({ id: "reader", isAdmin: true, permissions: [PERMISSIONS.PRODUCT_READ] });
 expect((await allocateProductSkusAction([{key:"x",sku:"ABC"}])).ok).toBe(false);expect(mocks.findSkus).not.toHaveBeenCalled();
 mocks.permission.mockResolvedValue({id:"writer",isAdmin:true,permissions:[PERMISSIONS.PRODUCT_READ,PERMISSIONS.PRODUCT_CREATE]});
 expect((await allocateProductSkusAction([{key:"x",sku:"bad sku"}])).ok).toBe(false);expect(mocks.findSkus).not.toHaveBeenCalled();
});
it("SKU generation resolves database collisions without returning existing product identities", async () => {
 mocks.findSkus.mockResolvedValueOnce([{sku:"MLP-BIREL-M"}]).mockResolvedValueOnce([]);
 const result=await allocateProductSkusAction([{key:"blue|m",sku:"MLP-BIREL-M"}]);
 expect(result.ok).toBe(true);expect(result.data?.[0].sku).toMatch(/^MLP-BIREL-M-[A-F0-9]{10}$/);expect(result.data?.[0].key).toBe("blue|m");
});
