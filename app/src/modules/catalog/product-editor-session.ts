import "server-only";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { HttpError } from "@/lib/response";
/** Call only after requirePermission has validated the live session and revocation. */
export async function productEditorSessionHash() {
  const token = (await cookies()).get(
    process.env.AUTH_COOKIE_NAME ?? "store_session",
  )?.value;
  if (!token) throw new HttpError("Sesi tidak valid", 401);
  return createHash("sha256").update(token).digest("hex");
}
