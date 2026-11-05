import "server-only";
import { HttpError } from "@/lib/http-error";
export async function readJntBytes(req: Request, limit: number) {
  if (Number(req.headers.get("content-length") || 0) > limit) throw new HttpError("Permintaan terlalu besar", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError("Permintaan kosong", 422);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let expired = false;
  const deadline = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 15_000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (expired) throw new HttpError("Waktu membaca permintaan habis", 408);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new HttpError("Permintaan terlalu besar", 413); }
      chunks.push(value);
    }
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

export async function readJntJson(req: Request, limit: number): Promise<unknown> {
  const bytes = await readJntBytes(req, limit);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new HttpError("JSON tidak valid", 422); }
}
