import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { handle, HttpError, ok } from "@/lib/response";
import { canReadApplicationUpdates } from "@/modules/application-updates/access";
import { checkForUpdates, readUpdateStatus } from "@/modules/application-updates/service";
export const dynamic = "force-dynamic";

async function authorize() {
  const actor = await requirePermission(PERMISSIONS.AUDIT_READ);
  if (!canReadApplicationUpdates(actor)) throw new HttpError("Administrator dengan izin audit diperlukan", 403);
}
function privateResponse(data: unknown) {
  const response = ok(data); response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Vary", "Cookie"); return response;
}
export function GET() {
  return handle(async () => { await authorize(); return privateResponse(readUpdateStatus()); });
}
export function POST(req: Request) {
  return handle(async () => {
    await authorize(); assertSameOrigin(req);
    if (req.headers.get("content-type")?.split(";")[0] !== "application/json") throw new HttpError("Gunakan JSON kosong untuk pemeriksaan", 422);
    const reader = req.body?.getReader(); if (!reader) throw new HttpError("Payload diperlukan", 422);
    let input = ""; const decoder = new TextDecoder(); let length = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 64) { await reader.cancel(); throw new HttpError("Payload terlalu besar", 413); } input += decoder.decode(value, { stream: true }); }
    input += decoder.decode();
    let body; try { body = JSON.parse(input); } catch { throw new HttpError("JSON tidak valid", 422); }
    if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).length) throw new HttpError("Pemeriksaan tidak menerima URL, versi, atau perintah", 422);
    return privateResponse(await checkForUpdates());
  });
}
