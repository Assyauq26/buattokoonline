import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { REGISTRATION_RECOVERY_MS } from "@/modules/auth/registration-contract";
import { HttpError } from "@/lib/response";

type AuthOperation =
  | "login"
  | "register"
  | "registerConfirm"
  | "registerStatus"
  | "reset"
  | "sellerResetRequest"
  | "resetConfirm";
const policies = {
  login: { perIdentity: 10, windowMs: 15 * 60_000, global: 300 },
  register: { perIdentity: 3, windowMs: 60 * 60_000, global: 30 },
  registerConfirm: { perIdentity: 12, windowMs: 60 * 60_000, global: 240 },
  registerStatus: { perIdentity: 60, windowMs: 60 * 60_000, global: 240 },
  resetConfirm: { perIdentity: 3, windowMs: 60 * 60_000, global: 60 },
  reset: { perIdentity: 3, windowMs: 60 * 60_000, global: 30 },
  sellerResetRequest: { perIdentity: 3, windowMs: 60 * 60_000, global: 30 },
} as const;

/** Server deployment metadata only; never derive a quota realm from a request. */
export function authRateLimitRealm(
  env: Record<string, string | undefined> = process.env,
) {
  let realm: string | undefined;
  if (env.VERCEL_ENV) {
    if (!["production", "preview", "development"].includes(env.VERCEL_ENV)) {
      throw new HttpError("Konfigurasi pembatas autentikasi tidak valid", 503);
    }
    realm = env.VERCEL_ENV;
  }
  if (env.NETLIFY === "true") {
    const contexts = new Map([
      ["production", "production"],
      ["deploy-preview", "preview"],
      ["branch-deploy", "preview"],
      ["dev", "development"],
    ]);
    const context = contexts.get(env.CONTEXT || "");
    if (!context || (realm && realm !== context))
      throw new HttpError("Konfigurasi pembatas autentikasi tidak valid", 503);
    realm = context;
  }
  return (
    realm ||
    (env.STORE_ISOLATED_TESTS === "1"
      ? "isolated-tests"
      : env.NODE_ENV === "development"
        ? "development"
        : "production")
  );
}

/** Atomic PostgreSQL counter, shared by serverless instances. No raw identity/IP stored. */
export async function consumeAuthBucket(
  bucket: string,
  limit: number,
  expiresAt: Date,
) {
  const rows = await prisma.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "AuthRateLimit" ("bucket", "attempts", "expiresAt") VALUES (${bucket}, 1, ${expiresAt})
    ON CONFLICT ("bucket") DO UPDATE SET "attempts" = "AuthRateLimit"."attempts" + 1
    WHERE "AuthRateLimit"."attempts" < ${limit}
    RETURNING "attempts"`;
  if (!rows.length)
    throw new HttpError("Terlalu banyak percobaan. Coba lagi nanti.", 429);
  return rows[0].attempts;
}

export async function enforceAuthRateLimit(
  operation: AuthOperation,
  identifier: string,
) {
  const namespace = `auth:${authRateLimitRealm()}`;
  const now = Date.now();
  const policy = policies[operation];
  const minute = Math.floor(now / 60_000);
  const count = await consumeAuthBucket(
    `${namespace}:${operation}:global:${minute}`,
    policy.global,
    new Date((minute + 1) * 60_000),
  );
  if (count === 1) {
    // Indexed, opportunistic retention cleanup. A DB error must fail closed.
    await prisma.authRateLimit.deleteMany({
      where: { expiresAt: { lt: new Date(now) } },
    });
    await prisma.sessionRevocation.deleteMany({
      where: { expiresAt: { lt: new Date(now) } },
    });
    await prisma.pendingRegistration.deleteMany({
      where: { expiresAt: { lt: new Date(now - REGISTRATION_RECOVERY_MS) } },
    });
  }
  const identity = createHash("sha256")
    .update(identifier.toLowerCase().trim())
    .digest("hex");
  const window = Math.floor(now / policy.windowMs);
  await consumeAuthBucket(
    `${namespace}:${operation}:${identity}:${window}`,
    policy.perIdentity,
    new Date((window + 1) * policy.windowMs),
  );
}

/** A rotating email cannot probe or resend for one phone without a shared quota. */
export async function enforceRegistrationPhoneLimit(phone: string) {
  const policy = policies.register;
  const window = Math.floor(Date.now() / policy.windowMs);
  const digest = createHash("sha256").update(phone).digest("hex");
  await consumeAuthBucket(
    `auth:${authRateLimitRealm()}:register:phone:${digest}:${window}`,
    policy.perIdentity,
    new Date((window + 1) * policy.windowMs),
  );
}
