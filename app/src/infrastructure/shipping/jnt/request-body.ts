import "server-only";
import { HttpError } from "@/lib/http-error";
export async function readJntJson(req: Request, limit: number): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError("Permintaan kosong", 422);
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new HttpError("Permintaan terlalu besar", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError("JSON tidak valid", 422); }
}
