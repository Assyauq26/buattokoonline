vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  createManagedProduct,
  getManagedProduct,
  updateManagedProduct,
} from "@/modules/catalog/product-management.service";
import { generateCombinations } from "@/modules/catalog/variation-domain";
import { reserveStock, releaseStock, adjustStock } from "@/modules/inventory/inventory.service";
import { addItem, getCartView } from "@/modules/cart/cart.service";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/product_editor_test"
)
  throw Error("Requires isolated product_editor_test database");
const actor = {
  id: "",
  isAdmin: true,
  permissions: Object.values(PERMISSIONS),
};
beforeAll(async () => {
  actor.id = (
    await prisma.user.create({
      data: {
        name: "Uji editor",
        email: randomUUID() + "@example.test",
        passwordHash: "disabled-test-login",
      },
    })
  ).id;
});
afterAll(async () => prisma.$disconnect());
const input = (stock = 0) => ({
  name: "Produk uji",
  slug: "uji-" + randomUUID(),
  basePrice: 10000,
  salePrice: null,
  variantMode: "simple" as const,
  optionsEnabled: false,
  variants: [{ sku: "UJI-" + randomUUID(), onHand: stock }],
  weightGrams: 100,
});
async function simple(stock = 0) {
  const result = await createManagedProduct(actor, input(stock));
  return getManagedProduct(actor, result.id);
}
async function save(p: Awaited<ReturnType<typeof simple>>, patch: object = {}) {
  await updateManagedProduct(actor, p.id, p.updatedAt, { ...p, ...patch });
  return getManagedProduct(actor, p.id);
}
function groups(a = 2, b = 3) {
  return [a, b].map((count, index) => ({
    id: "g" + randomUUID(),
    name: index ? "Ukuran" : "Warna",
    allowsImage: false,
    values: Array.from({ length: count }, (_, i) => ({
      id: "v" + randomUUID(),
      value: String(i + 1),
    })),
  }));
}
async function variable(a = 2, b = 3) {
  const g = groups(a, b);
  const value = {
    ...input(),
    variantMode: "variable",
    optionsEnabled: true,
    optionGroups: g,
    variants: generateCombinations(g).map((ids) => ({
      sku: randomUUID(),
      optionValueIds: ids,
      onHand: 0,
    })),
  };
  const result = await createManagedProduct(actor, value);
  return getManagedProduct(actor, result.id);
}

describe("remediasi editor dengan transaksi PostgreSQL nyata", () => {
  it("reservasi bersamaan tidak oversell dan edit stale tidak mereset stok", async () => {
    const p = await simple(5), id = p.variants[0].id!;
    const reservations = await Promise.allSettled([1, 2].map(() => prisma.$transaction(tx => reserveStock(tx, id, 4, randomUUID()))));
    expect(reservations.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { variantId: id } })).reserved).toBe(4);
    await prisma.$transaction(tx => releaseStock(tx, id, 4, randomUUID()));
    await adjustStock(id, 8, "Uji perubahan di luar editor", { expectedOnHand: 5 });
    await expect(save(p, { variants: [{ ...p.variants[0], onHand: 6 }] })).rejects.toMatchObject({ status: 409 });
    expect((await prisma.inventory.findUniqueOrThrow({ where: { variantId: id } })).onHand).toBe(8);
  });
  it("menambah dan menghapus opsi aman menjaga SKU yang masih ada", async () => {
    let p = await variable(1, 1);
    const old = p.variants[0];
    const group = {
      ...p.optionGroups![0],
      values: [
        ...p.optionGroups![0].values,
        { id: "v" + randomUUID(), value: "Baru", imageId: null },
      ],
    };
    const g = [group, p.optionGroups![1]];
    p = await save(p, {
      optionGroups: g,
      variants: [
        old,
        {
          sku: randomUUID(),
          optionValueIds: [group.values[1].id, g[1].values[0].id],
          onHand: 0,
        },
      ],
    });
    expect(p.variants).toHaveLength(2);
    p = await save(p, {
      optionGroups: [{ ...group, values: [group.values[0]] }, g[1]],
      variants: [p.variants.find((v) => v.id === old.id)!],
    });
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0].id).toBe(old.id);
  });
  it("rename dan pengurutan tetap menyimpan mapping gambar opsi", async () => {
    let p = await variable(1, 1);
    const image = await prisma.productImage.create({
      data: {
        productId: p.id,
        url: "/icon.svg",
        alt: "Motif uji",
        isVariation: true,
      },
    });
    p = await getManagedProduct(actor, p.id);
    const g = p.optionGroups!.map((group, i) => ({
      ...group,
      allowsImage: i === 0,
      values: group.values.map((v) => ({
        ...v,
        imageId: i === 0 ? image.id : null,
      })),
    }));
    p = await save(p, { optionGroups: g });
    p = await save(p, {
      optionGroups: [...p.optionGroups!]
        .reverse()
        .map((group) => ({ ...group, name: group.name + " baru" })),
    });
    expect(
      p.optionGroups!.find((group) => group.allowsImage)?.values[0].imageId,
    ).toBe(image.id);
  });
  it("membuat simple tepat satu SKU dan satu inventory", async () => {
    const p = await simple();
    expect(p.optionsEnabled).toBe(false);
    expect(p.variants).toHaveLength(1);
    expect(
      await prisma.inventory.count({ where: { variantId: p.variants[0].id } }),
    ).toBe(1);
  });
  it("edit nama, harga, diskon dan stok mempertahankan ID/SKU", async () => {
    let p = await simple();
    const row = p.variants[0];
    p = await save(p, {
      name: "Nama baru",
      basePrice: 15000,
      salePrice: 12000,
      variants: [{ ...row, onHand: 7 }],
    });
    expect(p.variants[0].id).toBe(row.id);
    expect(p.variants[0].sku).toBe(row.sku);
    expect(p.variants[0].onHand).toBe(7);
    expect(p.salePrice).toBe(12000);
    const count = await prisma.inventoryMovement.count({
      where: { variantId: row.id },
    });
    await save(p);
    expect(
      await prisma.inventoryMovement.count({ where: { variantId: row.id } }),
    ).toBe(count);
  });
  it("kode SKU tanpa stok/riwayat dapat diedit", async () => {
    const p = await simple();
    const next = await save(p, {
      variants: [{ ...p.variants[0], sku: randomUUID() }],
    });
    expect(next.variants[0].id).toBe(p.variants[0].id);
    expect(next.variants[0].sku).not.toBe(p.variants[0].sku);
  });
  it.each([
    [2, 3, 6],
    [3, 3, 9],
  ])("membentuk %i x %i tepat %i SKU", async (a, b, n) => {
    const p = await variable(a, b);
    expect(p.variants).toHaveLength(n);
    expect(new Set(p.variants.map((v) => v.id)).size).toBe(n);
  });
  it("rename dan reorder opsi menjaga identitas, harga, stok", async () => {
    const p = await variable();
    const before = p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      ids: [...v.optionValueIds!].sort(),
    }));
    const next = await save(p, {
      optionGroups: [...p.optionGroups!]
        .reverse()
        .map((g) => ({
          ...g,
          name: g.name + " baru",
          values: [...g.values]
            .reverse()
            .map((v) => ({ ...v, value: v.value + " baru" })),
        })),
    });
    expect(
      next.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        ids: [...v.optionValueIds!].sort(),
      })),
    ).toEqual(before);
  });
  it("harga fallback tetap ketika semua SKU punya override", async () => {
    const p = await variable();
    const next = await save(p, {
      basePrice: 25000,
      variants: p.variants.map((v) => ({ ...v, price: 9000, salePrice: 7000 })),
    });
    expect(next.basePrice).toBe(25000);
    expect(
      next.variants.every((v) => v.price === 9000 && v.salePrice === 7000),
    ).toBe(true);
  });
  it("konversi simple ke variable yang aman mempertahankan SKU survivor", async () => {
    const p = await simple();
    const g = groups(1, 1);
    const next = await save(p, {
      variantMode: "variable",
      optionsEnabled: true,
      optionGroups: g,
      variants: [
        { ...p.variants[0], optionValueIds: generateCombinations(g)[0] },
      ],
    });
    expect(next.optionsEnabled).toBe(true);
    expect(next.variants[0].id).toBe(p.variants[0].id);
    const restored = await save(next, {
      variantMode: "simple",
      optionsEnabled: false,
      optionGroups: [],
      variants: [
        { ...next.variants[0], optionValueIds: [], color: "", size: "" },
      ],
    });
    expect(restored.optionsEnabled).toBe(false);
    expect(restored.variants[0].id).toBe(p.variants[0].id);
  });
  it("konversi tidak boleh mengganti semua ID lama", async () => {
    const p = await simple();
    const g = groups(1, 1);
    await expect(
      save(p, {
        variantMode: "variable",
        optionsEnabled: true,
        optionGroups: g,
        variants: [
          { sku: randomUUID(), optionValueIds: generateCombinations(g)[0] },
        ],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("stok/riwayat memblokir rename kode, hapus dan konversi", async () => {
    const p = await simple(4);
    const g = groups(1, 1);
    await expect(
      save(p, { variants: [{ ...p.variants[0], sku: randomUUID() }] }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      save(p, { variants: [{ sku: randomUUID() }] }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      save(p, {
        variantMode: "variable",
        optionsEnabled: true,
        optionGroups: g,
        variants: [
          { ...p.variants[0], optionValueIds: generateCombinations(g)[0] },
        ],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getManagedProduct(actor, p.id)).variants[0].onHand).toBe(4);
  });
  it("keranjang aktif melindungi SKU walau stok nol", async () => {
    const p = await simple();
    await prisma.cart.create({
      data: {
        userId: actor.id,
        items: { create: { variantId: p.variants[0].id!, quantity: 1 } },
      },
    });
    await expect(
      save(p, { variants: [{ ...p.variants[0], sku: randomUUID() }] }),
    ).rejects.toMatchObject({ status: 409 });
    await prisma.cart.deleteMany({ where: { userId: actor.id } });
  });
  it("snapshot pesanan tidak ikut berubah ketika produk diedit", async () => {
    const p = await simple();
    const order = await prisma.order.create({
      data: {
        userId: actor.id,
        orderNumber: randomUUID(),
        subtotal: 10000,
        total: 10000,
        items: {
          create: {
            variantId: p.variants[0].id!,
            productName: "Nama asli",
            variantLabel: "Pilihan asli",
            unitPrice: 10000,
            quantity: 1,
            lineTotal: 10000,
          },
        },
      },
      include: { items: true },
    });
    await save(p, { name: "Nama lain", basePrice: 20000 });
    expect(
      await prisma.orderItem.findMany({ where: { orderId: order.id } }),
    ).toEqual(order.items);
  });
  it("stok tidak boleh di bawah reservasi", async () => {
    const p = await simple(5);
    await prisma.inventory.update({
      where: { variantId: p.variants[0].id! },
      data: { reserved: 3 },
    });
    await expect(
      save(p, { variants: [{ ...p.variants[0], onHand: 2 }] }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getManagedProduct(actor, p.id)).variants[0].onHand).toBe(5);
  });
  it("stok stale dan dua edit bersamaan hanya satu write diterima", async () => {
    const p = await simple();
    const result = await Promise.allSettled([
      save(p, { basePrice: 11000 }),
      save(p, { basePrice: 12000 }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("SKU case-insensitive bertabrakan termasuk concurrent create", async () => {
    const value = input();
    const results = await Promise.allSettled([
      createManagedProduct(actor, value),
      createManagedProduct(actor, {
        ...value,
        slug: "uji-" + randomUUID(),
        variants: [{ sku: value.variants[0].sku.toLowerCase() }],
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("replay save tidak menduplikasi produk atau movement", async () => {
    const value = input(3),
      ctx = { requestId: randomUUID(), sessionHash: "a".repeat(64) };
    const first = await createManagedProduct(actor, value, ctx);
    const again = await createManagedProduct(actor, value, ctx);
    expect(again.id).toBe(first.id);
    const p = await getManagedProduct(actor, first.id);
    expect(
      await prisma.inventoryMovement.count({
        where: { variantId: p.variants[0].id },
      }),
    ).toBe(1);
  });
  it("izin stok dan produk ditegakkan server", async () => {
    const p = await simple();
    await expect(
      updateManagedProduct({ ...actor, isAdmin: false }, p.id, p.updatedAt, p),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      updateManagedProduct(
        { ...actor, permissions: [PERMISSIONS.PRODUCT_UPDATE] },
        p.id,
        p.updatedAt,
        { ...p, variants: [{ ...p.variants[0], onHand: 5 }] },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("keranjang menggunakan harga fallback dan diskon SKU terbaru", async () => {
    const p = await simple(5);
    await prisma.product.update({
      where: { id: p.id },
      data: {
        status: "PUBLISHED",
        images: { create: { url: "/icon.svg", alt: "Gambar uji" } },
      },
    });
    await addItem(actor.id, p.variants[0].id!, 1);
    let cart = await getCartView(actor.id);
    expect(cart.lines[0].unitPrice).toBe(10000);
    const current = await getManagedProduct(actor, p.id);
    await save(current, {
      variants: [{ ...current.variants[0], price: 15000, salePrice: 12000 }],
    });
    cart = await getCartView(actor.id);
    expect(cart.lines[0].unitPrice).toBe(12000);
  });
});
