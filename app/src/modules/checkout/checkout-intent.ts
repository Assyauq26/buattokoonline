import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { authRateLimitRealm, consumeAuthBucket } from "@/lib/auth/rate-limit";
import { getDirectCheckoutView } from "@/modules/cart/cart.service";

export const CHECKOUT_INTENT_COOKIE = "gh_buy_now";
export const CHECKOUT_INTENT_TTL_SECONDS = 15 * 60;
export const checkoutIntentId = z.string().uuid();
const selectionSchema = z.object({ variantId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(999) }).strict();
const digest = (secret: string) => createHash("sha256").update(secret).digest("hex");
const unavailable = () => new HttpError("Checkout tidak tersedia atau sudah kedaluwarsa. Pilih produk kembali.", 409);

/** Only a hash is persisted. The secret is returned solely to a HttpOnly cookie. */
export async function createCheckoutIntent(userId: string | null, selection: unknown, browserSecret?: string) {
  const parsed = selectionSchema.safeParse(selection);
  if (!parsed.success) throw new HttpError("Pilihan produk tidak valid", 422);
  const minute = Math.floor(Date.now() / 60_000);
  const namespace = `checkout-intent:${authRateLimitRealm()}`;
  const globalCount = await consumeAuthBucket(`${namespace}:global:${minute}`, 300, new Date((minute + 1) * 60_000));
  if (globalCount === 1) {
    // Bounded retention; completed orders and audit history are never deleted.
    await prisma.$executeRaw`DELETE FROM "CheckoutIntent" WHERE id IN (
      SELECT id FROM "CheckoutIntent" WHERE "expiresAt" < NOW() - INTERVAL '7 days'
      ORDER BY "expiresAt", id LIMIT 1000 FOR UPDATE SKIP LOCKED
    )`;
  }
  const secret = /^[a-f0-9]{64}$/.test(browserSecret || "") ? browserSecret! : randomBytes(32).toString("hex");
  const window = Math.floor(Date.now() / (15 * 60_000));
  await consumeAuthBucket(`${namespace}:${digest(userId || secret)}:${window}`, 30, new Date((window + 1) * 15 * 60_000));
  const view = await getDirectCheckoutView(parsed.data.variantId, parsed.data.quantity);
  if (!view.lines[0].inStock) throw new HttpError("Produk tidak tersedia atau stok tidak mencukupi", 409);
  const intent = await prisma.checkoutIntent.create({ data: {
    ...parsed.data, userId, guestSecretHash: userId ? null : digest(secret),
    expiresAt: new Date(Date.now() + CHECKOUT_INTENT_TTL_SECONDS * 1000),
  } });
  return { id: intent.id, secret, expiresAt: intent.expiresAt };
}

/** Claim after login requires the original browser secret; an ID in a URL is insufficient. */
export async function claimCheckoutIntent(id: string, userId: string, browserSecret?: string) {
  if (!checkoutIntentId.safeParse(id).success) throw unavailable();
  if (/^[a-f0-9]{64}$/.test(browserSecret || "")) {
    await prisma.checkoutIntent.updateMany({
      where: { id, userId: null, guestSecretHash: digest(browserSecret!), consumedAt: null, expiresAt: { gt: new Date() } },
      data: { userId, guestSecretHash: null },
    });
  }
  return readCheckoutIntent(id, userId);
}

export async function readCheckoutIntent(id: string, userId: string, tx: Prisma.TransactionClient = prisma, allowConsumed = false) {
  if (!checkoutIntentId.safeParse(id).success) throw unavailable();
  const intent = await tx.checkoutIntent.findFirst({ where: { id, userId } });
  if (!intent || (!allowConsumed && (intent.consumedAt || intent.expiresAt <= new Date())) ||
    (allowConsumed && !intent.consumedAt && intent.expiresAt <= new Date())) throw unavailable();
  return intent;
}

export async function getIntentCheckoutView(id: string, userId: string, tx: Prisma.TransactionClient = prisma) {
  const intent = await readCheckoutIntent(id, userId, tx);
  return getDirectCheckoutView(intent.variantId, intent.quantity, tx);
}
