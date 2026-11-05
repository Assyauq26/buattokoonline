import { handle, ok, HttpError } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCustomizePermission } from "@/modules/appearance/authorization";
import { executeAppearanceCommand } from "@/modules/appearance/commands";
import { readDraft } from "@/modules/appearance/service";
export const dynamic = "force-dynamic";
function privateResponse(data: unknown) {
  const response = ok(data);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
export async function GET() {
  return handle(async () => {
    await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_READ);
    return privateResponse(await readDraft());
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const reader = req.body?.getReader();
    if (!reader) throw new HttpError("Payload diperlukan", 422);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 40000) {
        await reader.cancel();
        throw new HttpError("Payload terlalu besar", 413);
      }
      chunks.push(value);
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new HttpError("JSON tidak valid", 422);
    }
    return privateResponse(await executeAppearanceCommand(input));
  });
}
