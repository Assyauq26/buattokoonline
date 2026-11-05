import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";
import { prisma } from "@/lib/prisma";
import type { VerifiedSession } from "./jwt";

/** Shared by every identity query; this is never a persistent user cache. */
export function activeSessionWhere(claims: VerifiedSession) {
  return {
    id: claims.sub,
    isActive: true,
    sessionVersion: claims.version,
    revokedSessions: { none: { tokenHash: claims.tokenHash, expiresAt: { gt: new Date() } } },
  };
}

export async function revokeSession(claims: VerifiedSession) {
  await prisma.sessionRevocation.upsert({
    where: { tokenHash: claims.tokenHash },
    create: { tokenHash: claims.tokenHash, userId: claims.sub, expiresAt: claims.expiresAt },
    update: {},
  });
}

/** RLS-hidden rows must never be mistaken for the absence of revocation. */
export async function assertSessionRevocationAccess(client: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma) {
  const rows = await client.$queryRaw<{ allowed: boolean }[]>`
    SELECT c.relrowsecurity
      AND NOT pg_catalog.row_security_active(c.oid)
      AND pg_catalog.has_table_privilege(c.oid, 'SELECT') AS allowed
    FROM pg_catalog.pg_class c WHERE c.oid = '"SessionRevocation"'::regclass`;
  if (rows.length !== 1 || rows[0].allowed !== true) {
    throw new HttpError("Layanan autentikasi belum siap", 503);
  }
}
