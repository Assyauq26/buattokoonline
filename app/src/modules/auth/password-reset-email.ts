import { storeOrigin } from "@/lib/store-config";
import { registrationMailConfig, sendStoreMail } from "./registration-otp-email";

export function resetMailConfig() {
  storeOrigin();
  return registrationMailConfig();
}

export function sendPasswordResetEmail(email: string, token: string, config: ReturnType<typeof resetMailConfig>) {
  return sendStoreMail("customer-reset", email, token, config);
}
