"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth/session";
import {
  requestRegistrationOtp,
  RegistrationError,
  getRegistrationChallenge,
  verifyRegistrationOtp,
  resendRegistrationOtp,
  authenticate,
  requestPasswordReset,
  resetPassword,
} from "./auth.service";
import { runAction, type ActionResult } from "@/lib/action";
import { HttpError } from "@/lib/response";
import type { RegistrationFailure } from "./registration-contract";

import {
  registrationSchema,
  registrationVerificationSchema,
  registrationResendSchema,
} from "./registration-schema";

/** Preserve structured registration errors without changing other action contracts. */
async function registrationResult<T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T> & { errorCode?: RegistrationFailure }> {
  let errorCode: RegistrationFailure | undefined;
  const result = await runAction(async () => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof RegistrationError) errorCode = error.code;
      else if (error instanceof HttpError && error.status === 429)
        errorCode = "TOO_MANY_REQUESTS";
      throw error;
    }
  });
  return { ...result, errorCode };
}

export async function registerAction(_prev: unknown, formData: FormData) {
  const parsed = registrationSchema.safeParse({
    ...Object.fromEntries(formData),
    terms: formData.get("terms") === "1",
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const result = await registrationResult(() =>
    requestRegistrationOtp(parsed.data),
  );
  if (!result.ok)
    return { ok: false, error: result.error, errorCode: result.errorCode };
  return {
    ok: true,
    step: "verify",
    ...result.data!,
    message: "Kode OTP telah dikirim ke email Anda.",
  };
}

export async function registrationStatusAction(
  _prev: unknown,
  formData: FormData,
) {
  const parsed = registrationResendSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success)
    return {
      ok: false,
      error: "Sesi pendaftaran tidak valid.",
      errorCode: "CHALLENGE_MISSING" as const,
    };
  const result = await registrationResult(() =>
    getRegistrationChallenge(parsed.data.email, parsed.data.challengeId),
  );
  if (!result.ok)
    return { ok: false, error: result.error, errorCode: result.errorCode };
  return { ok: true, ...result.data! };
}

export async function verifyRegistrationAction(
  _prev: unknown,
  formData: FormData,
) {
  const parsed = registrationVerificationSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16)
    return { ok: false, error: "Layanan autentikasi belum dikonfigurasi." };
  const result = await registrationResult(async () => {
    const user = await verifyRegistrationOtp(
      parsed.data.email,
      parsed.data.otp,
      parsed.data.challengeId,
    );
    await createSession(user.id, user.email, user.sessionVersion);
  });
  if (!result.ok)
    return { ok: false, error: result.error, errorCode: result.errorCode };
  // The client may animate success only after BOTH the account and session are confirmed.
  return { ok: true, verified: true, message: "Email berhasil diverifikasi." };
}

export async function resendRegistrationAction(
  _prev: unknown,
  formData: FormData,
) {
  const parsed = registrationResendSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const result = await registrationResult(() =>
    resendRegistrationOtp(parsed.data.email, parsed.data.challengeId),
  );
  if (!result.ok)
    return { ok: false, error: result.error, errorCode: result.errorCode };
  return {
    ok: true,
    ...result.data!,
    message: "Kode OTP baru telah dikirim ke email Anda.",
  };
}

const loginSchema = z.object({
  identifier: z.string().min(1, "Email/No HP wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
  redirectTo: z.string().optional(),
});

/** Only allow same-site relative paths to prevent open-redirect phishing. */
function safeRedirect(
  target: string | undefined,
  fallback = "/account",
): string {
  if (
    target &&
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(target)
  )
    return target;
  return fallback;
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const res = await runAction(async () => {
    const user = await authenticate(
      parsed.data.identifier,
      parsed.data.password,
    );
    await createSession(user.id, user.email, user.sessionVersion);
    return user;
  });
  if (!res.ok) return res;
  redirect(safeRedirect(parsed.data.redirectTo));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function forgotPasswordAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "");
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, error: "Email tidak valid" };
  }
  const res = await runAction(() => requestPasswordReset(email));
  if (!res.ok) return res;
  return {
    ok: true,
    message: "Jika email terdaftar, tautan reset telah dikirim.",
  };
}

export async function resetPasswordAction(_prev: unknown, formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 6)
    return { ok: false, error: "Password minimal 6 karakter" };
  const res = await runAction(() => resetPassword(token, password));
  if (!res.ok) return res;
  redirect("/login");
}
