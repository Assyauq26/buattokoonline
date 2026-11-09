import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { handle, ok, HttpError } from "@/lib/response";
import { readUploadFormData } from "@/lib/upload-body";
import { operationOk } from "@/modules/admin/operations-cache";
import {
  requestResolution,
  commandResolution,
  resolutionView,
  uploadResolutionFile,
} from "@/modules/orders/resolution.service";
export const dynamic = "force-dynamic";
const identifier = z.string().min(1).max(128);
export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    const id = identifier.parse(new URL(req.url).searchParams.get("orderId"));
    const r = ok(await resolutionView(id, { id: u.id, staff: u.isAdmin }));
    r.headers.set("Cache-Control", "private, no-store");
    return r;
  });
}
async function json(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError("Data diperlukan", 422);
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32768) {
      await reader.cancel();
      throw new HttpError("Data terlalu besar", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError("Data tidak valid", 422);
  }
}
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const u = await requireUser(),
      a = { id: u.id, staff: u.isAdmin };
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await readUploadFormData(req, 4 * 1024 * 1024 + 32768),
        id = identifier.parse(form.get("id")),
        kind = z.enum(["transfer", "evidence"]).parse(form.get("kind")),
        file = form.get("file");
      if (!(file instanceof File)) throw new HttpError("File diperlukan", 422);
      const fields: Record<string, string> = {};
      for (const [k, v] of form.entries())
        if (!["id", "kind", "file"].includes(k)) {
          if (typeof v !== "string")
            throw new HttpError("Data tidak valid", 422);
          fields[k] = v;
        }
      return operationOk(
        await uploadResolutionFile(
          id,
          a,
          kind,
          fields,
          new Uint8Array(await file.arrayBuffer()),
          file.type,
        ),
      );
    }
    const body = z
      .object({
        id: identifier,
        operation: z.enum(["request", "command"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await json(req));
    return operationOk(
      body.operation === "request"
        ? await requestResolution(body.id, a, body.data)
        : await commandResolution(body.id, a, body.data),
    );
  });
}
