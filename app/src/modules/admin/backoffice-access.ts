import "server-only";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import type { PermissionKey } from "@/lib/auth/permissions";

/** Reuse the existing session and DB permissions; no separate seller identity. */
export async function requireBackofficeUser(permission?: PermissionKey) {
  const user = await getCurrentUser(false);
  if (!user) redirect("/login?redirectTo=/admin");
  if (!user.isAdmin || (permission && !user.permissions.includes(permission))) notFound();
  return user;
}
