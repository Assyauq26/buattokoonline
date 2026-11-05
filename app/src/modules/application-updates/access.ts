import { PERMISSIONS } from "@/lib/auth/permissions";

/** Read-only release inspection uses the existing audited administrator permission. */
export function canReadApplicationUpdates(actor: { isAdmin: boolean; roles: string[]; permissions: string[] } | null) {
  return !!actor?.isAdmin && actor.roles.includes("Admin") && actor.permissions.includes(PERMISSIONS.AUDIT_READ);
}
