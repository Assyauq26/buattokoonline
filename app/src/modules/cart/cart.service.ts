import { withCampaignPricing } from "@/modules/promotions/campaign-pricing";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { effectivePrice } from "@/lib/money";
import { activeScheduledFlashPrice, effectiveProductPrice } from "@/modules/promotions/scheduled-flash-sale";
import { available } from "@/modules/inventory/inventory.service";
import { HttpError } from "@/lib/response";

function validateQuantity(quantity: number, allowRemoval = false) {
  if (!Number.isSafeInteger(quantity) || (!allowRemoval && quantity <= 0)) {
    throw new HttpError("Jumlah produk tidak valid", 400);
  }
}

/** The parent-cart lock is also used by checkout before it consumes lines.
 * Native INSERT/ON CONFLICT handles simultaneous first adds without a
 * read/create race. Lock before reading quantities, not just before the write.
 */
async function lockCart(tx: Prisma.TransactionClient, userId: string, create: boolean) {
  const rows = create
    ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "Cart" ("id", "userId", "updatedAt") VALUES (${randomUUID()}, ${userId}, NOW())
        ON CONFLICT ("userId") DO UPDATE SET "updatedAt" = "Cart"."updatedAt"
        RETURNING "id"
      `)
    : await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Cart" WHERE "userId" = ${userId} FOR UPDATE
      `);
  return rows[0] ?? null;
}

export async function getOrCreateCart(userId: string) {
  return prisma.$transaction(async tx => {
    const cart = await lockCart(tx, userId, true);
    return tx.cart.findUniqueOrThrow({ where: { id: cart!.id } });
  });
}

/** Server-authoritative unit price for a variant. */
function unitPriceFor(variant: {
  price: number | null;
  salePrice: number | null;
  product: {
    basePrice: number; salePrice: number | null;
    flashSalePrice: number | null; flashSaleStartsAt: Date | null; flashSaleEndsAt: Date | null;
  };
}): number {
  const campaignPrice=activeScheduledFlashPrice(variant.product);
  if (campaignPrice!=null) return campaignPrice;
  if (variant.price != null) {
    return effectivePrice(variant.price, variant.salePrice);
  }
  return effectiveProductPrice(variant.product);
}

export const checkoutVariantSelection = {
  optionValues: { select: { value: { select: { value: true, group: { select: { name: true, sortOrder: true, allowsImage: true } }, image: { select: { url: true } } } } } },
  color: true,
  size: true,
  price: true,
  salePrice: true,
  inventory: { select: { onHand: true, reserved: true } },
  product: {
    select: {
      id: true,
      optionsEnabled: true,
      name: true,
      slug: true,
      status: true,
      basePrice: true,
      salePrice: true,
      isFlashSale: true,
      flashSalePrice: true,
      flashSaleStartsAt: true,
      flashSaleEndsAt: true,
      images: {
        where: { isVariation: false },
        select: { url: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
  },
} satisfies Prisma.ProductVariantSelect;

type CheckoutVariant = Prisma.ProductVariantGetPayload<{ select: typeof checkoutVariantSelection }>;

export async function getCartView(userId: string, client: Prisma.TransactionClient = prisma) {
  // A read of an empty cart must stay read-only. Cart creation is deferred to
  // the first mutation (add-to-cart), avoiding a DB write on every cart visit.
  // Load the cart and its lines in one relational query; the previous version
  // first loaded Cart and then issued a separate CartItem query.
  const cart = await client.cart.findUnique({
    where: { userId },
    select: {
      id: true,
      items: {
        select: {
          id: true,
          variantId: true,
          quantity: true,
          createdAt: true,
          variant: {
            select: checkoutVariantSelection,
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!cart) return { cartId: null, lines: [], subtotal: 0, count: 0 };

  const priced = await withCampaignPricing(cart.items.map(it=>it.variant.product),client);
  const lines = cart.items.map((it,index)=>checkoutLine({...it,variant:{...it.variant,product:priced[index]}}));

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  return { cartId: cart.id, lines, subtotal, count };
}

function checkoutLine(it: { id: string; variantId: string; quantity: number; variant: CheckoutVariant }) {
  const unitPrice = unitPriceFor(it.variant);
  const stock = it.variant.inventory
    ? available(it.variant.inventory.onHand, it.variant.inventory.reserved)
    : 0;
  const selections = it.variant.product.optionsEnabled ? [...it.variant.optionValues].sort((a,b) => a.value.group.sortOrder-b.value.group.sortOrder) : [];
  const optionImage = selections.find(s => s.value.group.allowsImage && s.value.image)?.value.image?.url;
  return {
    id: it.id,
    variantId: it.variantId,
    quantity: it.quantity,
    unitPrice,
    lineTotal: unitPrice * it.quantity,
    inStock: it.variant.product.status === "PUBLISHED" && stock >= it.quantity,
    availableStock: stock,
    product: {
      id: it.variant.product.id,
      name: it.variant.product.name,
      slug: it.variant.product.slug,
      image: optionImage ?? it.variant.product.images[0]?.url ?? null,
    },
    variantLabel: selections.length ? selections.map(s => `${s.value.group.name}: ${s.value.value}`).join(" / ") : [it.variant.color, it.variant.size].filter(Boolean).join(" / ") || "Default",
  };
}

/** Same authoritative price, option image and availability projection as cart checkout. */
export async function getDirectCheckoutView(variantId: string, quantity: number, client: Prisma.TransactionClient = prisma) {
  validateQuantity(quantity);
  const variant = await client.productVariant.findUnique({ where: { id: variantId }, select: checkoutVariantSelection });
  if (!variant) throw new HttpError("Varian tidak ditemukan", 404);
  const [product] = await withCampaignPricing([variant.product],client);
  const line = checkoutLine({ id: variantId, variantId, quantity, variant:{...variant,product} });
  return { cartId: null, lines: [line], subtotal: line.lineTotal, count: quantity };
}

async function incrementItem(userId: string, variantId: string, quantity: number) {
  validateQuantity(quantity);
  await prisma.$transaction(async tx => {
    const cart = await lockCart(tx, userId, true);
    const variant = await tx.productVariant.findUnique({
      where: { id: variantId, product: { status: "PUBLISHED" } },
      select: { id: true, inventory: { select: { onHand: true, reserved: true } } },
    });
    if (!variant) throw new HttpError("Varian tidak ditemukan", 404);
    const existing = await tx.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart!.id, variantId } },
      select: { quantity: true },
    });
    const desired = (existing?.quantity ?? 0) + quantity;
    const stock = variant.inventory ? available(variant.inventory.onHand, variant.inventory.reserved) : 0;
    if (desired > stock) throw new HttpError("Stok tidak mencukupi", 409);
    await tx.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart!.id, variantId } },
      create: { cartId: cart!.id, variantId, quantity },
      update: { quantity: desired },
    });
  });
}

export async function addItem(userId: string, variantId: string, quantity = 1) {
  await incrementItem(userId, variantId, quantity);
  return getCartView(userId);
}

/** Same locked increment as regular add, without the full cart-view query. */
export async function quickAddItem(userId: string, variantId: string, quantity = 1) {
  await incrementItem(userId, variantId, quantity);
}

export async function updateItem(userId: string, itemId: string, quantity: number) {
  validateQuantity(quantity, true);
  await prisma.$transaction(async tx => {
    const cart = await lockCart(tx, userId, false);
    if (!cart) throw new HttpError("Keranjang tidak ditemukan", 404);
    const item = await tx.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      include: { variant: { include: { inventory: true } } },
    });
    if (!item) throw new HttpError("Item tidak ditemukan", 404);
    if (quantity <= 0) {
      await tx.cartItem.delete({ where: { id: itemId } });
      return;
    }
    const stock = item.variant.inventory ? available(item.variant.inventory.onHand, item.variant.inventory.reserved) : 0;
    if (quantity > stock) throw new HttpError("Stok tidak mencukupi", 409);
    await tx.cartItem.update({ where: { id: itemId }, data: { quantity } });
  });
  return getCartView(userId);
}

export async function removeItem(userId: string, itemId: string) {
  await prisma.$transaction(async tx => {
    const cart = await lockCart(tx, userId, false);
    if (cart) await tx.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  });
  return getCartView(userId);
}


/** Badge count without fetching product/media/pricing relations. */
export async function getCartCount(userId: string) {
  const total = await prisma.cartItem.aggregate({ where: { cart: { userId } }, _sum: { quantity: true } });
  return total._sum.quantity ?? 0;
}
