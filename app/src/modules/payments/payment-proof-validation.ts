import { HttpError } from "@/lib/response";

export const MAX_PROOF_BYTES = 4 * 1024 * 1024;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Validate actual file magic as well as the untrusted client MIME type. */
export function validatePaymentProof(data: Uint8Array, mime: string): string {
  if (!data.length || data.length > MAX_PROOF_BYTES) throw new HttpError("Bukti transfer maksimal 4 MB", 413);
  const png = data.length >= 24 && [137,80,78,71,13,10,26,10].every((n,i) => data[i] === n);
  const jpeg = data.length >= 4 && data[0] === 255 && data[1] === 216 && data[2] === 255;
  const webp = data.length >= 12 && Buffer.from(data.subarray(0,4)).toString("ascii") === "RIFF" && Buffer.from(data.subarray(8,12)).toString("ascii") === "WEBP";
  const pdf = data.length >= 8 && Buffer.from(data.subarray(0,5)).toString("ascii") === "%PDF-";
  if (!(mime === "image/png" && png || mime === "image/jpeg" && jpeg || mime === "image/webp" && webp || mime === "application/pdf" && pdf)) {
    throw new HttpError("File bukti transfer tidak sesuai format JPG, PNG, WebP, atau PDF", 422);
  }
  return extensions[mime];
}
