import { handle, fail } from "@/lib/response";
import { RegistrationError } from "./auth.service";

export function registrationHandle(fn: () => Promise<Response>) {
  return handle(async () => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof RegistrationError)
        return fail(error.message, error.status, { code: error.code });
      throw error;
    }
  });
}
