import { HttpError } from "@/lib/response";
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const formats = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export function validateProductImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new HttpError("Gambar harus berukuran 1 byte–4 MB", 422);
  const png =
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const jpeg =
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  const webp =
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP";
  if (
    !(
      (mime === "image/png" && png) ||
      (mime === "image/jpeg" && jpeg) ||
      (mime === "image/webp" && webp)
    )
  )
    throw new HttpError("Gunakan file JPG, PNG, atau WebP yang valid", 422);
  return formats[mime as keyof typeof formats];
}
