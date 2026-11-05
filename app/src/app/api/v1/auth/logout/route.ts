import { ok } from "@/lib/response";
import { destroySession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await destroySession();
  return ok({ loggedOut: true });
}
