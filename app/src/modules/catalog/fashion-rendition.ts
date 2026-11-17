import "server-only";
import sharp from "sharp";
import { HttpError } from "@/lib/response";
import { fashionWidths } from "./fashion-image";

// Source IDs are immutable. Call only after the route's normal visibility checks.
const cache = new Map<string, Buffer>();
const inFlight = new Map<string, Promise<Buffer>>();
let bytes = 0;
export async function fashionRendition(
  req: Request,
  id: string,
  read: () => Promise<Uint8Array>,
) {
  const w = new URL(req.url).searchParams.get("w");
  if (w === null) return null;
  if (!fashionWidths.some((n) => String(n) === w))
    throw new HttpError("Ukuran foto tidak tersedia", 400);
  const key = id + "-" + w,
    tag = '"fashion-1-' + key + '"';
  const headers = {
    "Content-Type": "image/webp",
    "Cache-Control": "private, no-cache",
    ETag: tag,
    "X-Content-Type-Options": "nosniff",
  };
  if (req.headers.get("if-none-match") === tag)
    return new Response(null, { status: 304, headers });
  let data = cache.get(key);
  if (!data) {
    let task = inFlight.get(key);
    if (!task) {
      if (inFlight.size >= 12)
        throw new HttpError("Foto sedang diproses. Coba lagi.", 503);
      task = read()
        .then((buf) =>
          sharp(buf, { limitInputPixels: 40000000 })
            .rotate()
            .resize({ width: Number(w), withoutEnlargement: true })
            .webp({ quality: 76 })
            .toBuffer(),
        )
        .then((buf) => {
          while (cache.size && bytes + buf.length > 24 * 1024 * 1024) {
            const oldest = cache.keys().next().value!;
            bytes -= cache.get(oldest)!.length;
            cache.delete(oldest);
          }
          if (buf.length <= 24 * 1024 * 1024) {
            cache.set(key, buf);
            bytes += buf.length;
          }
          return buf;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, task);
    }
    data = await task;
  }
  return new Response(new Uint8Array(data), { headers });
}
