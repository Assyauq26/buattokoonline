import { ok, fail, handle } from "@/lib/response";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return fail("Not authenticated", 401);
    return ok(user);
  });
}
