/** Public, non-sensitive registration metadata shared by form and REST clients. */
export const REGISTRATION_CONFLICT =
  "Email atau nomor HP sudah terdaftar. Silakan masuk atau reset password.";
export const REGISTRATION_OTP_STORAGE_KEY = "store.registration.otp.v1";
export const REGISTRATION_RECOVERY_MS = 30 * 60_000;
export type RegistrationFailure =
  | "REGISTRATION_CONFLICT"
  | "CHALLENGE_MISSING"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "OTP_ATTEMPTS_EXHAUSTED"
  | "OTP_DELIVERY_FAILED"
  | "OTP_SENDING"
  | "TOO_MANY_REQUESTS";
export type RegistrationChallenge = {
  email: string;
  challengeId: string;
  expiresAt: number;
  resendAvailableAt: number;
  serverNow: number;
  /** Service entry timestamp; lets clients separate provider work from transport latency. */
  serverReceivedAt?: number;
  status: "active" | "expired" | "locked" | "sending";
};
