import { z } from "zod";
import { ok, handle } from "@/lib/response";
import { authenticate } from "@/modules/auth/auth.service";
import { createSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const schema = z.object({ identifier: z.string().min(1), password: z.string().min(1) });

export async function POST(req: Request) {
  return handle(async () => {
    const body = schema.parse(await req.json());
    const user = await authenticate(body.identifier, body.password);
    await createSession(user.id, user.email, user.sessionVersion);
    return ok({ id: user.id, name: user.name, email: user.email });
  });
}
