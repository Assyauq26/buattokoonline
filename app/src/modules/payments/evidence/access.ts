import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { HttpError } from "@/lib/response";
import { evidenceAdminAllowed } from "./access-policy";

export async function requireEvidenceAdmin(page = false) {
  const user = await getCurrentUser(false);
  if (!user || !evidenceAdminAllowed(user)) {
    if (page) notFound();
    throw new HttpError(
      user
        ? "Uji pembayaran tidak tersedia untuk akun ini"
        : "Sesi wajib tersedia",
      user ? 403 : 401,
    );
  }
  return user!;
}
