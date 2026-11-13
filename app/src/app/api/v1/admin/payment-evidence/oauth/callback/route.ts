import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { storeOrigin } from "@/lib/store-config";
import { completeGoogleOAuth } from "@/modules/payments/evidence/google";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const target = new URL(
    "/admin/settings/payment-methods/gmail-bank",
    storeOrigin(),
  );
  try {
    const user = await requirePermission(PERMISSIONS.BANK_MANAGE);
    const params = new URL(req.url).searchParams;
    if (params.has("error")) throw new Error("Consent refused");
    await completeGoogleOAuth(
      user.id,
      params.get("state") || "",
      params.get("code") || "",
    );
    target.searchParams.set("oauth", "connected");
  } catch {
    // Never echo authorization codes, tokens or provider error descriptions to UI/logs.
    target.searchParams.set("oauth", "retry");
  }
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
