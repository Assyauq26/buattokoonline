"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import { toggleWishlist } from "./wishlist.service";

export async function toggleWishlistAction(productId: string) {
  return runAction(async () => {
    const user = await requireUser();
    const res = await toggleWishlist(user.id, productId);
    revalidatePath("/wishlist");
    return res;
  });
}
