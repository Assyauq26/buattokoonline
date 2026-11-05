import { prisma } from "@/lib/prisma";
import { MovementType, Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";

export function available(onHand: number, reserved: number): number {
  return onHand - reserved;
}

function validateMovementQuantity(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 2_147_483_647) throw new HttpError("Jumlah stok tidak valid", 400);
}

export async function reserveStock(tx: Prisma.TransactionClient, variantId: string, quantity: number, reference: string) {
  validateMovementQuantity(quantity);
  const count = await tx.$executeRaw(Prisma.sql`
    UPDATE "Inventory" SET "reserved" = "reserved" + ${quantity}, "updatedAt" = NOW()
    WHERE "variantId" = ${variantId} AND "reserved" >= 0
      AND "onHand" - "reserved" >= ${quantity}
  `);
  if (count !== 1) throw new HttpError("Stok tidak mencukupi", 409);
  await tx.inventoryMovement.create({ data: { variantId, type: MovementType.RESERVATION, quantity, reference } });
}

export async function releaseStock(tx: Prisma.TransactionClient, variantId: string, quantity: number, reference: string) {
  validateMovementQuantity(quantity);
  const count = await tx.$executeRaw(Prisma.sql`
    UPDATE "Inventory" SET "reserved" = "reserved" - ${quantity}, "updatedAt" = NOW()
    WHERE "variantId" = ${variantId} AND "reserved" >= ${quantity} AND "onHand" >= "reserved"
  `);
  if (count !== 1) throw new HttpError("Reservasi stok tidak konsisten", 409);
  await tx.inventoryMovement.create({ data: { variantId, type: MovementType.RELEASE, quantity, reference } });
}

export async function commitSale(tx: Prisma.TransactionClient, variantId: string, quantity: number, reference: string) {
  validateMovementQuantity(quantity);
  const count = await tx.$executeRaw(Prisma.sql`
    UPDATE "Inventory" SET "reserved" = "reserved" - ${quantity}, "onHand" = "onHand" - ${quantity}, "updatedAt" = NOW()
    WHERE "variantId" = ${variantId} AND "reserved" >= ${quantity} AND "onHand" >= "reserved"
  `);
  if (count !== 1) throw new HttpError("Reservasi stok tidak konsisten", 409);
  await tx.inventoryMovement.create({ data: { variantId, type: MovementType.SALE, quantity, reference } });
}

export async function adjustStock(
  variantId: string,
  newOnHand: number,
  note?: string,
  options: { tx?: Prisma.TransactionClient; expectedOnHand?: number; reference?: string } = {},
) {
  if (!Number.isSafeInteger(newOnHand) || newOnHand < 0 || newOnHand > 2_147_483_647) {
    throw new HttpError("Jumlah stok tidak valid", 400);
  }
  const adjust = async (tx: Prisma.TransactionClient) => {
    const previous = await tx.inventory.findUnique({ where: { variantId } });
    const oldOnHand = previous?.onHand ?? 0;
    if (previous && (previous.reserved < 0 || previous.reserved > oldOnHand)) throw new HttpError("Stok tidak konsisten; lakukan rekonsiliasi sebelum adjustment", 409);
    if (options.expectedOnHand !== undefined && options.expectedOnHand !== oldOnHand) {
      throw new HttpError("Stok sudah berubah. Muat ulang sebelum melakukan adjustment.", 409);
    }
    if (newOnHand < (previous?.reserved ?? 0)) {
      throw new HttpError("Stok tidak boleh lebih kecil dari stok yang direservasi", 409);
    }
    if (previous) {
      const updated = await tx.inventory.updateMany({ where: { variantId, onHand: oldOnHand, reserved: { gte: 0, lte: newOnHand } }, data: { onHand: newOnHand } });
      if (updated.count !== 1) throw new HttpError("Stok sudah berubah. Muat ulang dan coba lagi.", 409);
    } else {
      await tx.inventory.create({ data: { variantId, onHand: newOnHand } });
    }
    await tx.inventoryMovement.create({
      data: {
        variantId,
        type: MovementType.ADJUSTMENT,
        quantity: newOnHand - oldOnHand,
        reference: options.reference,
        note: note ?? "manual adjustment",
      },
    });
    return tx.inventory.findUniqueOrThrow({ where: { variantId } });
  };
  return options.tx ? adjust(options.tx) : prisma.$transaction(adjust);
}
