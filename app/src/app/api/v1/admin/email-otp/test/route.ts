import { HttpError, handle, ok } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { enforceAuthRateLimit } from "@/lib/auth/rate-limit";
import { sendStoreMail } from "@/modules/auth/registration-otp-email";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const actor = await requirePermission(PERMISSIONS.STORE_CUSTOMIZE_PUBLISH);
    if (!actor.email) throw new HttpError("Email akun tidak tersedia.", 400);
    await enforceAuthRateLimit("mailTest", actor.id);
    await sendStoreMail("customer-test", actor.email, "");
    return ok({ accepted: true });
  });
}
