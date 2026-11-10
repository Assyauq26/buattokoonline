"use server";
import { requireBackofficeUser } from "./backoffice-access";
import { runAction } from "@/lib/action";
import { revalidatePath } from "next/cache";
import { saveSellerContact } from "./seller-profile.service";
export async function saveSellerName(value: unknown) {
  return runAction(async () => {
    const actor = await requireBackofficeUser();
    const result = await saveSellerContact(actor.id, value);
    revalidatePath("/admin", "layout");
    return result;
  });
}
