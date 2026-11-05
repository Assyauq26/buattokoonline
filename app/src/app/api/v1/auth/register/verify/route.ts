import { registrationHandle } from "@/modules/auth/registration-response";
import { assertMutationOrigin } from "@/lib/mutation-origin";
import { registrationVerificationSchema } from "@/modules/auth/registration-schema";
import { ok, HttpError } from "@/lib/response";
import { verifyRegistrationOtp } from "@/modules/auth/auth.service";
import { createSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return registrationHandle(async () => {
    assertMutationOrigin(req);
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
      throw new HttpError("Layanan autentikasi belum dikonfigurasi", 503);
    }
    const input = registrationVerificationSchema.parse(await req.json());
    const user = await verifyRegistrationOtp(
      input.email,
      input.otp,
      input.challengeId,
    );
    await createSession(user.id, user.email, user.sessionVersion);
    return ok({ id: user.id, name: user.name, email: user.email }, 201);
  });
}
