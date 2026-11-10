import "server-only";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
export async function whatsappRegistrationProof() {
  if (process.env.STORE_WHATSAPP_AUTH_ENABLED !== "1") return undefined;
  const cookie = (await cookies()).get("__Host-btos-wa")?.value;
  const match = /^([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(cookie || "");
  return match
    ? {
        id: match[1],
        hash: createHash("sha256").update(match[2]).digest("hex"),
      }
    : undefined;
}
