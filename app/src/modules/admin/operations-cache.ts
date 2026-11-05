import { revalidatePath, revalidateTag } from "next/cache";
import { ok } from "@/lib/response";
import { CATALOG_CACHE_TAG } from "@/modules/catalog/catalog-cache";
/** API adapters invalidate the same operational surfaces as server actions after commit. */
export function operationOk<T>(data: T, status?: number) {
  for (const path of ["/admin", "/admin/orders", "/admin/payments", "/admin/shipping", "/admin/inventory"]) revalidatePath(path);
  for (const path of ["/admin/orders/[id]", "/admin/inventory/[id]", "/orders/[id]", "/checkout/payment/[orderId]"]) revalidatePath(path, "page");
  revalidateTag(CATALOG_CACHE_TAG);
  return ok(data, status);
}
