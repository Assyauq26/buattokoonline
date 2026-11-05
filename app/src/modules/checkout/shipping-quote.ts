import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HttpError } from "@/lib/http-error";
import type { ShippingInquiry, ShippingRate } from "@/infrastructure/shipping/contracts/shipping-provider";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new HttpError("Konfigurasi quote pengiriman belum siap", 503);
  return value;
}
const tokenSchema = z.object({ fingerprint: z.string(), courier: z.literal("J&T Express"), service: z.string(), cost: z.number().int().nonnegative(), expiresAt: z.number().int() });
export function shippingFingerprint(userId: string, inquiry: ShippingInquiry, lines: unknown) {
  return hash({ userId, inquiry, lines, config: hash([process.env.SHIPPING_PROVIDER || "manual", process.env.JNT_MANUAL_RATE_CONFIG || "", process.env.JNT_OFFICIAL_AREA_MAPPING || "", process.env.JNT_ORIGIN_WAREHOUSE || "", process.env.JNT_API_ENV || "", process.env.JNT_RATE_SERVICES || ""]) });
}
export function issueShippingQuote(fingerprint: string, rate: ShippingRate) {
  const expiresAt = Math.min(Date.now() + 5 * 60_000, rate.validUntil ? new Date(rate.validUntil).getTime() : Infinity);
  const body = Buffer.from(JSON.stringify({ fingerprint, courier: rate.courier, service: rate.service, cost: rate.cost, expiresAt })).toString("base64url");
  return { ...rate, expiresAt, quoteToken: `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}` };
}
export function verifyShippingQuote(token: string | undefined, fingerprint: string, rate: ShippingRate) {
  try {
    if (!token || token.length > 4096) throw new Error();
    const [body, signature, extra] = token.split(".");
    if (!/^[A-Za-z0-9_-]+$/.test(body || "") || !/^[A-Za-z0-9_-]{43}$/.test(signature || "")) throw new Error();
    const expected = createHmac("sha256", secret()).update(body).digest();
    const actual = Buffer.from(signature || "", "base64url");
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const quote = tokenSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString()));
    if (quote.expiresAt <= Date.now() || quote.fingerprint !== fingerprint || quote.courier !== rate.courier || quote.service !== rate.service || quote.cost !== rate.cost) throw new Error();
    return quote;
  } catch { throw new HttpError("Alamat, berat, harga, atau ongkir berubah; quote dapat kedaluwarsa. Silakan periksa kembali total pesanan.", 409); }
}
