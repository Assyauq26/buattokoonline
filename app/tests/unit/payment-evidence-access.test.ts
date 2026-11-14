import { afterEach, expect, it, vi } from "vitest";
import { evidenceAdminAllowed } from "@/modules/payments/evidence/access-policy";
const admin = {
  id: "admin-fixture",
  roles: ["Admin"],
  permissions: ["bank.manage", "payment.read"],
};
const env = {
  PAYMENT_EVIDENCE_PREVIEW: "true",
  PAYMENT_EVIDENCE_ADMIN_IDS: "admin-fixture, another-admin",
};
afterEach(() => vi.unstubAllEnvs());
it("requires explicit allowlist, flag, Admin role and both permissions", () => {
  expect(evidenceAdminAllowed(admin, env)).toBe(true);
  for (const altered of [
    { ...env, PAYMENT_EVIDENCE_PREVIEW: "false" },
    { ...env, PAYMENT_EVIDENCE_ADMIN_IDS: "" },
    { ...env, PAYMENT_EVIDENCE_ADMIN_IDS: "admin-fixture-other" },
    {},
  ])
    expect(evidenceAdminAllowed(admin, altered)).toBe(false);
  for (const altered of [
    { ...admin, id: "other-store-admin" },
    { ...admin, roles: ["Finance"] },
    { ...admin, roles: ["Customer"] },
    { ...admin, permissions: ["payment.read"] },
    { ...admin, permissions: ["bank.manage"] },
  ])
    expect(evidenceAdminAllowed(altered, env)).toBe(false);
});
