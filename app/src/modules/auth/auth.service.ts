import {
  enforceAuthRateLimit,
  enforceRegistrationPhoneLimit,
} from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";
import { Prisma, type PendingRegistration } from "@prisma/client";
import {
  hashPassword,
  verifyPassword,
  DUMMY_PASSWORD_HASH,
} from "@/lib/auth/password";
import { HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import { randomBytes, randomUUID, createHash } from "crypto";
import {
  resetMailConfig,
  sendPasswordResetEmail,
} from "./password-reset-email";

import {
  registrationMailConfig,
  sendRegistrationOtpEmail,
} from "./registration-otp-email";
import {
  normalizeRegistrationPhone,
  generateRegistrationOtp,
  hashRegistrationOtp,
  compareRegistrationOtp,
} from "./registration-otp";

import {
  registrationSchema,
  registrationResendSchema,
  registrationVerificationSchema,
} from "./registration-schema";

import {
  REGISTRATION_CONFLICT,
  REGISTRATION_RECOVERY_MS,
  type RegistrationChallenge,
  type RegistrationFailure,
} from "./registration-contract";

import { registrationIdentityQuery, recoveryIdentityQuery } from "./registration-identity";

export class RegistrationError extends HttpError {
  constructor(
    public code: RegistrationFailure,
    message: string,
    status = 400,
  ) {
    super(message, status);
  }
}
export const REGISTRATION_OTP_DELIVERY_FAILURE =
  "OTP tidak dapat dikirim. Coba lagi nanti.";
const REGISTRATION_TTL_MS = 10 * 60_000;
const REGISTRATION_RESEND_MS = 60_000;
const REGISTRATION_MAX_ATTEMPTS = 5;

/** Include legacy local/formatted phones without rewriting any existing identity. */
export async function assertRegistrationIdentityAvailable(
  db: Prisma.TransactionClient | typeof prisma,
  email: string,
  phone: string,
) {
  const rows = await db.$queryRaw<{ conflict: boolean; filtered: boolean }[]>(
    registrationIdentityQuery(email, phone),
  );
  if (!rows[0] || rows[0].filtered)
    throw new HttpError(
      "Layanan pendaftaran belum tersedia. Coba lagi nanti.",
      503,
    );
  if (rows[0].conflict)
    throw new RegistrationError(
      "REGISTRATION_CONFLICT",
      REGISTRATION_CONFLICT,
      409,
    );
}

function challengeMetadata(
  pending: PendingRegistration,
  serverReceivedAt: number,
): RegistrationChallenge {
  const now = Date.now();
  return {
    email: pending.email,
    challengeId: pending.id,
    expiresAt: pending.expiresAt.getTime(),
    resendAvailableAt: pending.sentAt.getTime() + REGISTRATION_RESEND_MS,
    serverNow: now,
    serverReceivedAt,
    status: pending.codeHash.startsWith("sending:")
      ? "sending"
      : pending.attempts >= REGISTRATION_MAX_ATTEMPTS
        ? "locked"
        : pending.expiresAt.getTime() <= now
          ? "expired"
          : "active",
  };
}

/** Provider I/O never holds a transaction; an unactivated reservation is unverifiable. */
async function deliverRegistrationOtp(
  email: string,
  code: string,
  reservation: string,
  challengeId: string,
  config: ReturnType<typeof registrationMailConfig>,
  serverReceivedAt: number,
): Promise<RegistrationChallenge> {
  try {
    // Recheck immediately before delivery, including on resends.
    const pending = await prisma.pendingRegistration.findUnique({
      where: { id: challengeId },
    });
    if (!pending || pending.codeHash !== reservation)
      throw new RegistrationError(
        "CHALLENGE_MISSING",
        "Sesi pendaftaran tidak tersedia. Silakan daftar kembali.",
      );
    await assertRegistrationIdentityAvailable(prisma, email, pending.phone);
    await sendRegistrationOtpEmail(email, code, config);
    // A competing verified registration must not leave an active challenge behind.
    await assertRegistrationIdentityAvailable(prisma, email, pending.phone);
    const activated = await prisma.pendingRegistration.updateMany({
      where: {
        id: challengeId,
        email,
        codeHash: reservation,
        expiresAt: { gt: new Date() },
      },
      data: { codeHash: hashRegistrationOtp(email, code, challengeId) },
    });
    if (activated.count !== 1)
      throw new RegistrationError(
        "CHALLENGE_MISSING",
        "Sesi pendaftaran berubah. Silakan daftar kembali.",
      );
    const live = await prisma.pendingRegistration.findUniqueOrThrow({
      where: { id: challengeId },
    });
    return challengeMetadata(live, serverReceivedAt);
  } catch (error) {
    await prisma.pendingRegistration.deleteMany({
      where: { id: challengeId, email, codeHash: reservation },
    });
    if (error instanceof RegistrationError) throw error;
    throw new RegistrationError(
      "OTP_DELIVERY_FAILED",
      REGISTRATION_OTP_DELIVERY_FAILURE,
      503,
    );
  }
}

/** Validate conflicts before touching pending state or calling the mail provider. */
export async function requestRegistrationOtp(input: unknown) {
  const serverReceivedAt = Date.now();
  const data = registrationSchema.parse(input);
  const { email } = data;
  const phone = normalizeRegistrationPhone(data.phone);
  await enforceAuthRateLimit("register", email);
  await enforceRegistrationPhoneLimit(phone);
  await assertRegistrationIdentityAvailable(prisma, email, phone);
  const config = registrationMailConfig();
  const current = await prisma.pendingRegistration.findUnique({
    where: { email },
  });
  let code = generateRegistrationOtp();
  while (
    current &&
    compareRegistrationOtp(email, code, current.codeHash, current.id)
  )
    code = generateRegistrationOtp();
  const challengeId = randomUUID();
  hashRegistrationOtp(email, code, challengeId);
  const passwordHash = await hashPassword(data.password);
  const now = new Date();
  const reservation = "sending:" + randomUUID();
  const values = {
    id: challengeId,
    name: data.name,
    phone,
    passwordHash,
    codeHash: reservation,
    attempts: 0,
    expiresAt: new Date(now.getTime() + REGISTRATION_TTL_MS),
    sentAt: now,
  };
  if (current) {
    const saved = await prisma.pendingRegistration.updateMany({
      where: {
        id: current.id,
        codeHash: current.codeHash,
        sentAt: { lte: new Date(now.getTime() - REGISTRATION_RESEND_MS) },
      },
      data: values,
    });
    if (saved.count !== 1)
      throw new HttpError("Tunggu 60 detik sebelum meminta OTP baru.", 429);
  } else {
    try {
      await prisma.pendingRegistration.create({ data: { email, ...values } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new HttpError("Tunggu 60 detik sebelum meminta OTP baru.", 429);
      throw error;
    }
  }
  return deliverRegistrationOtp(
    email,
    code,
    reservation,
    challengeId,
    config,
    serverReceivedAt,
  );
}

async function registrationChallenge(
  email: string,
  challengeId: string,
  statusOnly = false,
) {
  await enforceAuthRateLimit(
    statusOnly ? "registerStatus" : "registerConfirm",
    "challenge:" + email + ":" + challengeId,
  );
  const current = await prisma.pendingRegistration.findUnique({
    where: { id: challengeId },
  });
  if (!current || current.email !== email)
    throw new RegistrationError(
      "CHALLENGE_MISSING",
      "Sesi pendaftaran tidak tersedia. Silakan daftar kembali.",
    );
  return current;
}

/** Only an opaque generation holder can recover timing/status, never credentials or the code. */
export async function getRegistrationChallenge(
  emailInput: string,
  challengeInput: string,
) {
  const serverReceivedAt = Date.now();
  const { email, challengeId } = registrationResendSchema.parse({
    email: emailInput,
    challengeId: challengeInput,
  });
  const pending = await registrationChallenge(email, challengeId, true);
  await assertRegistrationIdentityAvailable(prisma, email, pending.phone);
  return challengeMetadata(pending, serverReceivedAt);
}

export async function resendRegistrationOtp(
  emailInput: string,
  challengeInput: string,
) {
  const serverReceivedAt = Date.now();
  const { email, challengeId } = registrationResendSchema.parse({
    email: emailInput,
    challengeId: challengeInput,
  });
  const current = await registrationChallenge(email, challengeId);
  await enforceAuthRateLimit("register", email);
  await enforceRegistrationPhoneLimit(current.phone);
  await assertRegistrationIdentityAvailable(prisma, email, current.phone);
  const config = registrationMailConfig();
  const now = new Date();
  const recoveryCutoff = new Date(now.getTime() - REGISTRATION_RECOVERY_MS);
  if (current.expiresAt <= recoveryCutoff)
    throw new RegistrationError(
      "CHALLENGE_MISSING",
      "Sesi pendaftaran berakhir. Silakan daftar kembali.",
    );
  let code = generateRegistrationOtp();
  while (compareRegistrationOtp(email, code, current.codeHash, current.id))
    code = generateRegistrationOtp();
  hashRegistrationOtp(email, code, challengeId);
  const reservation = "sending:" + randomUUID();
  const saved = await prisma.pendingRegistration.updateMany({
    where: {
      id: current.id,
      codeHash: current.codeHash,
      sentAt: { lte: new Date(now.getTime() - REGISTRATION_RESEND_MS) },
      expiresAt: { gt: recoveryCutoff },
    },
    data: {
      codeHash: reservation,
      attempts: 0,
      expiresAt: new Date(now.getTime() + REGISTRATION_TTL_MS),
      sentAt: now,
    },
  });
  if (saved.count !== 1)
    throw new HttpError("Tunggu 60 detik sebelum meminta OTP baru.", 429);
  return deliverRegistrationOtp(
    email,
    code,
    reservation,
    challengeId,
    config,
    serverReceivedAt,
  );
}

export async function verifyRegistrationOtp(
  emailInput: string,
  otp: string,
  challengeInput: string,
) {
  const { email, challengeId } = registrationVerificationSchema.parse({
    email: emailInput,
    otp,
    challengeId: challengeInput,
  });
  await registrationChallenge(email, challengeId);
  await enforceAuthRateLimit("registerConfirm", email);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PendingRegistration[]>`
        SELECT * FROM "PendingRegistration" WHERE "email" = ${email} AND "id" = ${challengeId} FOR UPDATE`;
      const pending = rows[0];
      if (!pending)
        return {
          code: "CHALLENGE_MISSING",
          error: "Sesi pendaftaran tidak tersedia. Silakan daftar kembali.",
        } as const;
      if (pending.expiresAt <= new Date())
        return {
          code: "OTP_EXPIRED",
          error: "Kode OTP sudah kedaluwarsa. Silakan kirim ulang kode.",
        } as const;
      if (pending.attempts >= REGISTRATION_MAX_ATTEMPTS)
        return {
          code: "OTP_ATTEMPTS_EXHAUSTED",
          error: "Batas percobaan kode OTP tercapai. Silakan kirim ulang kode.",
        } as const;
      if (pending.codeHash.startsWith("sending:"))
        return {
          code: "OTP_SENDING",
          error: "Kode OTP masih dikirim. Silakan tunggu sebentar.",
        } as const;
      if (!compareRegistrationOtp(email, otp, pending.codeHash, pending.id)) {
        await tx.pendingRegistration.update({
          where: { id: pending.id },
          data: { attempts: { increment: 1 } },
        });
        return pending.attempts + 1 >= REGISTRATION_MAX_ATTEMPTS
          ? ({
              code: "OTP_ATTEMPTS_EXHAUSTED",
              error:
                "Batas percobaan kode OTP tercapai. Silakan kirim ulang kode.",
            } as const)
          : ({
              code: "OTP_INVALID",
              error: "Kode OTP salah. Periksa kembali dan coba lagi.",
            } as const);
      }
      await assertRegistrationIdentityAvailable(tx, email, pending.phone);
      await tx.pendingRegistration.delete({ where: { id: pending.id } });
      const role = await tx.role.findUnique({ where: { name: "Customer" } });
      const user = await tx.user.create({
        data: {
          name: pending.name,
          email,
          phone: pending.phone,
          passwordHash: pending.passwordHash,
          emailVerifiedAt: new Date(),
          customer: {
            create: { fullName: pending.name, phone: pending.phone },
          },
          cart: { create: {} },
          wishlist: { create: {} },
          ...(role ? { roles: { create: { roleId: role.id } } } : {}),
        },
      });
      await writeAudit(
        {
          userId: user.id,
          action: "auth.register.verified",
          entity: "User",
          entityId: user.id,
        },
        tx,
      );
      return { user } as const;
    });
    if (result.error !== undefined)
      throw new RegistrationError(result.code, result.error);
    return result.user;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new RegistrationError(
        "REGISTRATION_CONFLICT",
        REGISTRATION_CONFLICT,
        409,
      );
    throw error;
  }
}

async function recoveryUser(email: string | null, phone: string | null, rawPhone = "") {
  const rows = await prisma.$queryRaw<{ filtered: boolean; ids: string[] }[]>(
    recoveryIdentityQuery(email, phone, rawPhone),
  );
  if (!rows[0] || rows[0].filtered)
    throw new HttpError("Layanan autentikasi belum tersedia. Coba lagi nanti.", 503);
  // Include inactive identities in ambiguity detection; never try multiple passwords
  // or send a reset token to an arbitrarily selected canonical alias.
  if (rows[0].ids.length !== 1) return null;
  return prisma.user.findUnique({ where: { id: rows[0].ids[0] } });
}

export async function authenticate(identifier: string, password: string) {
  const value = identifier.toLowerCase().trim();
  let normalized: string | undefined;
  try {
    normalized = normalizeRegistrationPhone(identifier);
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 400)) throw error;
  }
  // Formatting aliases must share a quota; otherwise spaces could evade brute-force limits.
  await enforceAuthRateLimit("login", normalized ?? value);
  const user = await recoveryUser(value.includes("@") ? value : null,
    normalized ?? null, identifier.trim());
  const valid = await verifyPassword(
    password,
    user?.isActive ? user.passwordHash : DUMMY_PASSWORD_HASH,
  );
  if (!user || !user.isActive || !valid)
    throw new HttpError("Email/No HP atau password salah", 401);
  return user;
}

const tokenDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function requestPasswordReset(email: string) {
  // Check configuration BEFORE account lookup, so an unconfigured provider
  // cannot silently claim that mail has been sent to existing accounts.
  const normalizedEmail = email.toLowerCase().trim();
  await enforceAuthRateLimit("reset", normalizedEmail);
  const config = resetMailConfig();
  const user = await recoveryUser(normalizedEmail, null);
  if (!user || !user.isActive) return; // keep the form response identical for unknown emails
  const token = randomBytes(32).toString("hex");
  const record = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: tokenDigest(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  try {
    await sendPasswordResetEmail(user.email.trim().toLowerCase(), token, config);
  } catch {
    // A failed email must not leave a usable reset token behind.
    await prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
    throw new HttpError(
      "Email reset password gagal dikirim. Coba lagi nanti.",
      503,
    );
  }
}

export async function resetPassword(token: string, newPassword: string) {
  if (!/^[0-9a-f]{64}$/i.test(token))
    throw new HttpError("Token reset tidak valid atau kedaluwarsa", 400);
  await enforceAuthRateLimit("resetConfirm", tokenDigest(token));
  const record = await prisma.passwordResetToken.findUnique({
    where: { token: tokenDigest(token) },
  });
  if (!record)
    throw new HttpError("Token reset tidak valid atau kedaluwarsa", 400);
  const hash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    // Atomic consume prevents two parallel submissions of the same reset link.
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new HttpError("Token reset tidak valid atau kedaluwarsa", 400);
    await tx.user.update({
      where: { id: record.userId, isActive: true },
      data: { passwordHash: hash, sessionVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await writeAudit(
      {
        userId: record.userId,
        action: "auth.password.reset",
        entity: "User",
        entityId: record.userId,
      },
      tx,
    );
  });
}
