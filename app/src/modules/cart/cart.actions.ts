"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireUserBasic } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import * as cart from "./cart.service";

export async function addToCartAction(variantId: string, quantity = 1) {
  return runAction(async () => {
    const user = await requireUser();
    const view = await cart.addItem(user.id, variantId, quantity);
    revalidatePath("/cart");
    revalidatePath("/(storefront)", "layout");
    return view;
  });
}

/** Locked increment plus a narrow authoritative count for both cart badges. */
export async function quickAddToCartAction(variantId: string, quantity = 1) {
  return runAction(async () => {
    const user = await requireUserBasic();
    await cart.quickAddItem(user.id, variantId, quantity);
    revalidatePath("/cart");
    revalidatePath("/(storefront)", "layout");
    const count = await cart.getCartCount(user.id);
    return { count };
  });
}

export async function updateCartItemAction(itemId: string, quantity: number) {
  return runAction(async () => {
    const user = await requireUser();
    const view = await cart.updateItem(user.id, itemId, quantity);
    revalidatePath("/cart");
    revalidatePath("/(storefront)", "layout");
    return view;
  });
}

export async function removeCartItemAction(itemId: string) {
  return runAction(async () => {
    const user = await requireUser();
    const view = await cart.removeItem(user.id, itemId);
    revalidatePath("/cart");
    revalidatePath("/(storefront)", "layout");
    return view;
  });
}
