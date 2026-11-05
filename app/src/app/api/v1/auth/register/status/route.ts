import { assertMutationOrigin } from "@/lib/mutation-origin";
import { ok } from "@/lib/response";
import { registrationResendSchema } from "@/modules/auth/registration-schema";
import { getRegistrationChallenge } from "@/modules/auth/auth.service";
import { registrationHandle } from "@/modules/auth/registration-response";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return registrationHandle(async () => {
    assertMutationOrigin(req);
    const data = registrationResendSchema.parse(await req.json());
    return ok(await getRegistrationChallenge(data.email, data.challengeId));
  });
}
