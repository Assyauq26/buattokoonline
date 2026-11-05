"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { runAction } from "@/lib/action";
import { CATALOG_CACHE_TAG } from "@/modules/catalog/catalog-cache";
import { saveVoucher, setVoucherActive, setFlashSale, setScheduledFlashSale } from "./marketing.service";

export async function saveVoucherAction(id: string | null, value: unknown) {
  return runAction(async () => {
    const actor = await requirePermission(id ? PERMISSIONS.PROMOTION_UPDATE : PERMISSIONS.PROMOTION_CREATE);
    const result = await saveVoucher(actor, id, value);
    revalidatePath("/admin/marketing");
    return result;
  });
}

export async function toggleVoucherAction(id: string, active: boolean) {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PROMOTION_UPDATE);
    const result = await setVoucherActive(actor, id, active);
    revalidatePath("/admin/marketing");
    return result;
  });
}


export async function setScheduledFlashSaleAction(value: unknown) {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PROMOTION_UPDATE);
    const result = await setScheduledFlashSale(actor, value);
    revalidateTag(CATALOG_CACHE_TAG);
    for (const path of ["/admin/marketing", "/admin/products", "/", "/shop", "/search"])
      revalidatePath(path);
    revalidatePath("/product/[slug]", "page");
    return result;
  });
}

export async function setFlashSaleAction(value: unknown) {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PROMOTION_UPDATE);
    const result = await setFlashSale(actor, value);
    revalidateTag(CATALOG_CACHE_TAG);
    for (const path of ["/admin/marketing", "/admin/products", "/", "/shop", "/search"])
      revalidatePath(path);
    revalidatePath("/product/[slug]", "page");
    return result;
  });
}
