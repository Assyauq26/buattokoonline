import "server-only";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCustomizePermission } from "./authorization";
import { changeAppearance } from "./service";
import { appearanceSessionHash } from "./session";
import { APPEARANCE_TAG } from "./published";
const command = z
  .object({
    kind: z.enum(["save", "discard", "reset", "publish", "rollback"]),
    draftVersion: z.number().int().nonnegative(),
    publishedVersion: z.number().int().nonnegative(),
    config: z.unknown().optional(),
    revision: z.number().int().nonnegative().optional(),
  })
  .strict();
/** One authorization/transaction/cache boundary for server actions and HTTP clients. */
export async function executeAppearanceCommand(value: unknown) {
  const input = command.parse(value);
  const actor = await requireCustomizePermission(
    input.kind === "publish" || input.kind === "rollback"
      ? PERMISSIONS.STORE_CUSTOMIZE_PUBLISH
      : PERMISSIONS.STORE_CUSTOMIZE_UPDATE,
  );
  const result = await changeAppearance(
    input,
    actor.id,
    await appearanceSessionHash(),
  );
  if (input.kind === "publish" || input.kind === "rollback")
    revalidateTag(APPEARANCE_TAG);
  revalidatePath("/admin", "layout");
  return result;
}
