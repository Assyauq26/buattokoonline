import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  cart: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  cartItem: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  productVariant: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
// Next supplies this marker in server builds; unit imports run directly in Node.
vi.mock("server-only", () => ({}));

import { addItem, quickAddItem, updateItem } from "@/modules/cart/cart.service";

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
  db.$queryRaw.mockResolvedValue([{ id: "cart" }]);
  db.cart.findUnique.mockResolvedValue({ id: "cart", items: [] });
  db.cart.upsert.mockResolvedValue({ id: "cart" });
  db.productVariant.findUnique.mockResolvedValue({ id: "variant", inventory: { onHand: 10, reserved: 0 } });
  db.cartItem.findUnique.mockResolvedValue({ quantity: 2 });
  db.cartItem.findFirst.mockResolvedValue({ id: "item", variant: { inventory: { onHand: 10, reserved: 0 } } });
});

describe.each([addItem, quickAddItem])("cart add quantity boundary (%s)", (add) => {
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects %s before database access", async (quantity) => {
    await expect(add("customer", "variant", quantity)).rejects.toMatchObject({ status: 400 });
    expect(db.cart.findUnique).not.toHaveBeenCalled();
    expect(db.cart.create).not.toHaveBeenCalled();
    expect(db.cart.upsert).not.toHaveBeenCalled();
    expect(db.cartItem.upsert).not.toHaveBeenCalled();
  });

  it("preserves the default increment for an existing cart line", async () => {
    await add("customer", "variant");
    expect(db.cartItem.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { quantity: 3 } }));
  });
});

describe("cart update quantity boundary", () => {
  it.each([0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects %s before database access", async (quantity) => {
    await expect(updateItem("customer", "item", quantity)).rejects.toMatchObject({ status: 400 });
    expect(db.cart.findUnique).not.toHaveBeenCalled();
    expect(db.cartItem.update).not.toHaveBeenCalled();
    expect(db.cartItem.delete).not.toHaveBeenCalled();
  });

  it.each([0, -1])("preserves removal for quantity %s", async (quantity) => {
    await updateItem("customer", "item", quantity);
    expect(db.cartItem.delete).toHaveBeenCalledWith({ where: { id: "item" } });
  });

  it("preserves positive quantity updates", async () => {
    await updateItem("customer", "item", 3);
    expect(db.cartItem.update).toHaveBeenCalledWith({ where: { id: "item" }, data: { quantity: 3 } });
  });
});
