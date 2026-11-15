import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const value = process.env.PAYMENT_INTEGRATION_ENCRYPTION_KEY || "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new Error("Kunci integrasi pembayaran belum dikonfigurasi");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32)
    throw new Error("Kunci integrasi pembayaran tidak valid");
  return bytes;
}
function aad(scope: string, source: string, purpose: string) {
  if (!scope || !source || !purpose)
    throw new Error("Konteks enkripsi wajib diisi");
  return Buffer.from(
    JSON.stringify(["payment-evidence-v1", scope, source, purpose]),
  );
}
export function seal(
  value: string,
  scope: string,
  source: string,
  purpose: string,
) {
  if (Buffer.byteLength(value) > 64_000)
    throw new Error("Rahasia terlalu besar");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(scope, source, purpose));
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}
export function unseal(
  envelope: string,
  scope: string,
  source: string,
  purpose: string,
) {
  const [version, iv, tag, body, extra] = envelope.split(".");
  if (
    version !== "v1" ||
    !iv ||
    !tag ||
    !body ||
    extra ||
    envelope.length > 90_000
  )
    throw new Error("Rahasia integrasi tidak valid");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(aad(scope, source, purpose));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
