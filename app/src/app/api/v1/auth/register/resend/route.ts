import { registrationHandle } from "@/modules/auth/registration-response";
import { assertMutationOrigin } from "@/lib/mutation-origin";
import { registrationResendSchema } from "@/modules/auth/registration-schema";
import { ok } from "@/lib/response";
import { resendRegistrationOtp } from "@/modules/auth/auth.service";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return registrationHandle(async () => {
    assertMutationOrigin(req);
    const data = registrationResendSchema.parse(await req.json());
    const result = await resendRegistrationOtp(data.email, data.challengeId);
    return ok({ ...result, message: "Kode OTP telah dikirim." });
  });
}
