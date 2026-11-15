import { HttpError } from "@/lib/response";
export async function jsonBody(req: Request, limit = 16_000): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new HttpError("Gunakan application/json", 415);
  const reader = req.body?.getReader(); if (!reader) throw new HttpError("Body wajib diisi", 400);
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > limit) { await reader.cancel(); throw new HttpError("Request terlalu besar", 413); } chunks.push(value); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(); return data;
  } catch { throw new HttpError("JSON tidak valid", 400); }
}
