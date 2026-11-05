"use server";

import { cookies } from "next/headers";
import { getCurrentUserBasic } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import { CHECKOUT_INTENT_COOKIE, CHECKOUT_INTENT_TTL_SECONDS, createCheckoutIntent } from "./checkout-intent";

export async function buyNowAction(variantId: string, quantity: number) {
  return runAction(async () => {
    const user = await getCurrentUserBasic();
    const store = await cookies();
    const intent = await createCheckoutIntent(user?.id || null, { variantId, quantity }, store.get(CHECKOUT_INTENT_COOKIE)?.value);
    if (!user) store.set(CHECKOUT_INTENT_COOKIE, intent.secret, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: CHECKOUT_INTENT_TTL_SECONDS,
    });
    // Construct locally: never accept a client-controlled redirect URL.
    const checkout = `/checkout?intent=${intent.id}`;
    return { checkoutUrl: user ? checkout : `/login?redirectTo=${encodeURIComponent(checkout)}` };
  });
}
