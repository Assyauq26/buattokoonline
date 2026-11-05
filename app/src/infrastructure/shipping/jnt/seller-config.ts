import "server-only";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth/session";
export function localJntSettings() { return true; }
export function assertJntScope() { /* This database contains exactly one store. */ }
export function mayManageLocalJnt(user: Pick<AuthUser, "roles" | "permissions"> | null) {
  return !!user && user.roles.includes("Admin") && user.permissions.includes("shipping.update");
}
export function installationBinding(environment: string) {
  // Each installation has its own random encryption key, independent of brand/domain.
  return Buffer.from(`single-store:jnt:v2:${environment}`, "utf8");
}
export const sellerConfigurationSchema = z.object({
  warehouse: z.object({
    name: z.string().trim().min(1).max(30), contact: z.string().trim().min(1).max(30),
    phone: z.string().regex(/^\+62\d{8,12}$/), address: z.string().trim().min(4).max(200),
    originSite: z.string().regex(/^[A-Z][A-Z0-9 -]{1,79}$/), originCityCode: z.string().regex(/^[A-Z0-9]{3}$/),
  }).strict(),
  services: z.array(z.object({ code: z.literal("EZ"), verificationReference: z.string().trim().min(4).max(160), validUntil: z.string().datetime() }).strict()).max(1),
}).strict();
export type SellerConfiguration = z.infer<typeof sellerConfigurationSchema>;
