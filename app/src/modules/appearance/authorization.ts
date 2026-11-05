import "server-only";
import { requirePermission } from "@/lib/auth/session";
import type { PermissionKey } from "@/lib/auth/permissions";
import { HttpError } from "@/lib/response";
/** Conjoin the existing DB permission with the existing backoffice identity. */
export async function requireCustomizePermission(permission: PermissionKey) {
  const actor = await requirePermission(permission);
  if (!actor.isAdmin) throw new HttpError("Akses admin diperlukan", 403);
  return actor;
}
