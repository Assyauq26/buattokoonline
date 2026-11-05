
"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { revalidatePath, revalidateTag } from "next/cache";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCustomizePermission } from "@/modules/appearance/authorization";
import { appearanceSessionHash } from "@/modules/appearance/session";
import { executeHeroChange, readHeroDraft, HERO_TAG } from "./service";

const command = z.object({
  kind: z.enum(["save", "publish", "discard"]),
  draftVersion: z.number().int().nonnegative(),
  publishedVersion: z.number().int().nonnegative(),
  config: z.unknown().optional(),
}).strict();
export async function heroAction(input: unknown) {
  return runAction(async () => {
    const value = command.parse(input);
    const actor = await requireCustomizePermission(
      value.kind === "publish" ? PERMISSIONS.STORE_CUSTOMIZE_PUBLISH : PERMISSIONS.STORE_CUSTOMIZE_UPDATE,
    );
    const result = await executeHeroChange(value, actor.id, await appearanceSessionHash());
    if (value.kind === "publish") { revalidateTag(HERO_TAG); revalidatePath("/"); }
    return result;
  });
}
export async function loadHero() {
  return runAction(async () => {
    await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_READ);
    return readHeroDraft();
  });
}
