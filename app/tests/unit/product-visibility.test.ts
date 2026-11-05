import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ wishlist: { upsert: vi.fn(), findUnique: vi.fn() }, wishlistItem: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() }, product: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
// Next supplies this marker in server builds; unit imports run directly in Node.
vi.mock("server-only", () => ({}));
import { toggleWishlist, getWishlistView } from "@/modules/wishlist/wishlist.service";
beforeEach(() => { vi.clearAllMocks(); db.wishlist.upsert.mockResolvedValue({ id: "wishlist" }); db.wishlistItem.findUnique.mockResolvedValue(null); db.product.findFirst.mockResolvedValue(null); });
it("requires a published product before creating a buyer wishlist item", async () => {
  await expect(toggleWishlist("buyer", "draft")).rejects.toMatchObject({ status: 404 });
  expect(db.product.findFirst).toHaveBeenCalledWith({ where: { id: "draft", status: "PUBLISHED" }, select: { id: true } }); expect(db.wishlistItem.create).not.toHaveBeenCalled();
});
it("filters draft/archived products in the buyer wishlist without deleting their saved items", async () => {
  db.wishlist.findUnique.mockResolvedValue({ items: [] }); await getWishlistView("buyer");
  expect(db.wishlist.findUnique.mock.calls[0][0].include.items.where).toEqual({ product: { status: "PUBLISHED" } }); expect(db.wishlistItem.delete).not.toHaveBeenCalled();
});
it("still allows removing an archived favorite", async () => {
  db.wishlistItem.findUnique.mockResolvedValue({ id: "item" }); expect(await toggleWishlist("buyer", "archived")).toEqual({ active: false }); expect(db.product.findFirst).not.toHaveBeenCalled();
});
