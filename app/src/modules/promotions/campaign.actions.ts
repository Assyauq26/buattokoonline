"use server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { runAction } from "@/lib/action";
import { revalidatePath, revalidateTag } from "next/cache";
import { CATALOG_CACHE_TAG } from "@/modules/catalog/catalog-cache";
import {
  saveCampaign,
  endCampaign,
  campaignProducts,
  retireLegacy,
} from "./campaign.service";
function invalidate() {
  revalidateTag(CATALOG_CACHE_TAG);
  for (const path of [
    "/admin/marketing",
    "/admin/products",
    "/",
    "/shop",
    "/cart",
    "/checkout",
    "/search",
  ])
    revalidatePath(path);
  revalidatePath("/product/[slug]", "page");
}
export async function saveCampaignAction(value: unknown) {
  return runAction(async () => {
    const updating = Boolean(
      value && typeof value === "object" && "id" in value && value.id,
    );
    const actor = await requirePermission(
      updating ? PERMISSIONS.PROMOTION_UPDATE : PERMISSIONS.PROMOTION_CREATE,
    );
    const result = await saveCampaign(actor, value);
    invalidate();
    return result;
  });
}
export async function endCampaignAction(value: unknown) {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PROMOTION_UPDATE);
    const result = await endCampaign(actor, value);
    invalidate();
    return result;
  });
}
export async function retireLegacyAction(value: unknown) {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PROMOTION_UPDATE);
    const result = await retireLegacy(actor, value);
    invalidate();
    return result;
  });
}
export async function campaignProductsAction(query: {
  search?: string;
  categoryId?: string;
  page?: number;
}) {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PRODUCT_READ);
    return campaignProducts(actor, query);
  });
}
