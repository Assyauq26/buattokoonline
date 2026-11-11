import { z } from "zod";
import { handle, ok } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { readJntJson } from "@/infrastructure/shipping/jnt/request-body";
import { updaterCommand } from "@/modules/admin/updater-client";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z.object({ action: z.literal("check") }).strict(),
  z
    .object({
      action: z.literal("start"),
      sha: z.string().regex(/^[a-f0-9]{40}$/),
      requestKey: z.string().uuid(),
    })
    .strict(),
]);
export const runtime = "nodejs";
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const response = ok(
      await updaterCommand(schema.parse(await readJntJson(req, 2048))),
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
