import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { HttpError } from "@/lib/response";
function key() {
  const raw =
    process.env.ORDER_DATA_ENCRYPTION_KEY ||
    process.env.JNT_INTEGRATION_ENCRYPTION_KEY ||
    "";
  const source = /^[a-f0-9]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (source.length !== 32)
    throw new HttpError(
      "Penyimpanan rekening refund belum tersedia. Hubungi operator.",
      503,
    );
  return createHmac("sha256", source)
    .update("order-resolution:bank:v1")
    .digest();
}
export function sealRefundBank(value: unknown, caseId: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`refund-bank:v1:${caseId}`));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function openRefundBank(value: string, caseId: string) {
  try {
    const b = Buffer.from(value, "base64"),
      cipher = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    cipher.setAAD(Buffer.from(`refund-bank:v1:${caseId}`));
    cipher.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString(
        "utf8",
      ),
    );
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError("Rekening refund perlu diperiksa operator", 503);
  }
}
