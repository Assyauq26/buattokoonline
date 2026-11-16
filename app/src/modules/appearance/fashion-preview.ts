"use server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCustomizePermission } from "./authorization";
import { appearanceSchema } from "./schema";
import { fashionFrame } from "@/modules/catalog/fashion-catalog";
export async function readFashionPreview(value: unknown) {
  await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_READ);
  const config = appearanceSchema.parse(value);
  return fashionFrame(config.collections);
}
