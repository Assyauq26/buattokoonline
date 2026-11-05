import "server-only";
import { HttpError } from "@/lib/response";

/** Bounded multipart parser; rejects oversized bodies even when Content-Length is absent. */
export async function readUploadFormData(req: Request, limit: number): Promise<FormData> {
  const header = Number(req.headers.get("content-length") || 0);
  if (header > limit) throw new HttpError("Ukuran upload terlalu besar", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError("File diperlukan", 422);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError("Ukuran upload terlalu besar", 413);
    }
    chunks.push(value);
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": req.headers.get("content-type") || "" },
    }).formData();
  } catch {
    throw new HttpError("Data upload tidak valid", 422);
  }
}
