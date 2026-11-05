"use server";
import { z } from "zod";
import { requireCustomizePermission } from "@/modules/appearance/authorization";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { runAction } from "@/lib/action";
import { prisma } from "@/lib/prisma";
import { readDraft } from "./service";
import { executeAppearanceCommand } from "./commands";
export async function appearanceAction(value: unknown) {
  return runAction(() => executeAppearanceCommand(value));
}
export async function loadAppearance() {
  return runAction(async () => {
    await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_READ);
    return readDraft();
  });
}
export async function appearanceHistory(before?: number) {
  return runAction(async () => {
    await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_READ);
    if (before !== undefined) z.number().int().nonnegative().parse(before);
    return (
      await prisma.storeAppearanceRevision.findMany({
        where: before === undefined ? {} : { version: { lt: before } },
        orderBy: { version: "desc" },
        take: 25,
        select: { version: true, action: true, createdAt: true },
      })
    ).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  });
}
