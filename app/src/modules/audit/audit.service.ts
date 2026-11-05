import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function writeAudit(
  input: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    meta?: Prisma.InputJsonValue;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  await tx.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: input.meta ?? undefined,
    },
  });
}
