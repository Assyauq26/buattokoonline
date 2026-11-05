import { registrationHandle } from "@/modules/auth/registration-response";
import { assertMutationOrigin } from "@/lib/mutation-origin";
import { registrationSchema } from "@/modules/auth/registration-schema";
import { ok } from "@/lib/response";
import { requestRegistrationOtp } from "@/modules/auth/auth.service";

export const dynamic = "force-dynamic";
/** Initiate email verification; NEVER create a user or session without verifying OTP. */
export async function POST(req: Request) {
  return registrationHandle(async () => {
    assertMutationOrigin(req);
    const data = registrationSchema.parse(await req.json());
    const result = await requestRegistrationOtp(data);
    return ok(
      {
        email: result.email,
        challengeId: result.challengeId,
        verificationRequired: true,
        expiresAt: result.expiresAt,
        resendAvailableAt: result.resendAvailableAt,
        serverNow: result.serverNow,
        serverReceivedAt: result.serverReceivedAt,
        status: result.status,
      },
      202,
    );
  });
}
