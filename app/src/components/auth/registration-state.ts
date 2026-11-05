import {
  REGISTRATION_OTP_STORAGE_KEY,
  type RegistrationChallenge,
} from "@/modules/auth/registration-contract";

export type StoredRegistration = Pick<
  RegistrationChallenge,
  "email" | "challengeId"
>;
export function storedRegistration(value: unknown): StoredRegistration | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<StoredRegistration>;
  return typeof item.email === "string" &&
    item.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) &&
    typeof item.challengeId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      item.challengeId,
    )
    ? { email: item.email, challengeId: item.challengeId }
    : null;
}
type ClientChallenge = RegistrationChallenge & {
  clock?: { observedAt: number; serverNowAtReceipt: number };
};
export function asChallenge(value: unknown): ClientChallenge | null {
  const identity = storedRegistration(value);
  if (!identity) return null;
  const item = value as Partial<ClientChallenge>;
  if (
    ![item.expiresAt, item.serverNow, item.resendAvailableAt].every(
      (x) => typeof x === "number" && Number.isFinite(x),
    )
  )
    return null;
  if (!["active", "expired", "locked", "sending"].includes(item.status || ""))
    return null;
  return {
    ...identity,
    expiresAt: item.expiresAt!,
    resendAvailableAt: item.resendAvailableAt!,
    serverNow: item.serverNow!,
    ...(typeof item.serverReceivedAt === "number" &&
    Number.isFinite(item.serverReceivedAt) &&
    item.serverReceivedAt <= item.serverNow!
      ? { serverReceivedAt: item.serverReceivedAt }
      : {}),
    ...(item.clock &&
    Number.isFinite(item.clock.observedAt) &&
    Number.isFinite(item.clock.serverNowAtReceipt)
      ? { clock: item.clock }
      : {}),
    status: item.status!,
  };
}
export function readRegistration(): StoredRegistration | null {
  try {
    const raw = window.sessionStorage.getItem(REGISTRATION_OTP_STORAGE_KEY);
    const value = raw ? storedRegistration(JSON.parse(raw)) : null;
    if (raw && !value) clearRegistration();
    return value;
  } catch {
    return null;
  }
}
export function rememberRegistration(value: StoredRegistration) {
  try {
    // Timing always comes from the server after reload. Never store password, code or client expiry.
    window.sessionStorage.setItem(
      REGISTRATION_OTP_STORAGE_KEY,
      JSON.stringify({ email: value.email, challengeId: value.challengeId }),
    );
  } catch {
    /* The live flow still works if storage is disabled. */
  }
}
export function clearRegistration() {
  try {
    window.sessionStorage.removeItem(REGISTRATION_OTP_STORAGE_KEY);
  } catch {
    /* Private browsing. */
  }
}
export function registrationFields(value: StoredRegistration) {
  const data = new FormData();
  data.set("email", value.email);
  data.set("challengeId", value.challengeId);
  return data;
}
export function formatOtpTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Midpoint transport estimate excludes server/provider work; never changes DB deadlines. */
export async function timedRegistration<T extends object>(
  request: () => Promise<T>,
): Promise<T & { clock?: ClientChallenge["clock"] }> {
  const startedAt = performance.now();
  const result = await request();
  const observedAt = performance.now();
  const challenge = asChallenge(result);
  if (!challenge) return result;
  const processing = Math.max(
    0,
    challenge.serverNow - (challenge.serverReceivedAt ?? challenge.serverNow),
  );
  const transport = Math.max(0, observedAt - startedAt - processing);
  return {
    ...result,
    clock: {
      observedAt,
      serverNowAtReceipt: challenge.serverNow + transport / 2,
    },
  };
}
/** Monotonic elapsed time includes delays before React consumes the response. */
export function registrationNow(challenge: ClientChallenge): number {
  return challenge.clock
    ? challenge.clock.serverNowAtReceipt +
        Math.max(0, performance.now() - challenge.clock.observedAt)
    : challenge.serverNow;
}
