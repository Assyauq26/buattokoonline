import "server-only";
import sharp from "sharp";
import jsQR from "jsqr";
import { validateStaticQris } from "./qris";
import { HttpError } from "@/lib/response";

export async function decodeQrisImage(bytes: Uint8Array, declaredType: string) {
  if (!bytes.length || bytes.length > 4 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(declaredType))
    throw new HttpError("Gunakan PNG, JPEG atau WebP maksimal 4 MB", 422);
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, animated: false, failOn: "warning" });
    const meta = await image.metadata();
    const expected = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" }[declaredType];
    if (meta.format !== expected || !meta.width || !meta.height || Math.min(meta.width,meta.height)<64 ||
        Math.max(meta.width,meta.height)>4096 || (meta.pages || 1)>1) throw new Error("Format atau dimensi gambar tidak didukung");
    const { data, info } = await image.rotate().flatten({ background: "white" }).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const qr = jsQR(new Uint8ClampedArray(data),info.width,info.height,{ inversionAttempts: "attemptBoth" });
    if (!qr) throw new Error("QR tidak terbaca. Gunakan foto tajam tanpa pantulan atau tempel payload QRIS.");
    const checked = validateStaticQris(qr.data);
    const get = (tag: string) => checked.tags.find(t=>t.tag===tag)?.value;
    return { payload: qr.data, merchantName: get("59"), merchantCity: get("60"), destination: checked.destination };
  } catch (error) {
    throw new HttpError(error instanceof Error && !error.message.includes("Input") ? error.message.slice(0,200) : "Gambar QRIS tidak valid atau tidak terbaca",422);
  }
}
