/** Explicit per-installation operator enrollment. Never infer pilot access from
 * payment.read or the broad backoffice role group. No default enrollment. */
export function evidenceAdminAllowed(
  user: { id: string; roles: string[]; permissions: string[] },
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const ids = (env.PAYMENT_EVIDENCE_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    env.PAYMENT_EVIDENCE_PREVIEW === "true" &&
    ids.includes(user.id) &&
    user.roles.includes("Admin") &&
    user.permissions.includes("bank.manage") &&
    user.permissions.includes("payment.read")
  );
}
