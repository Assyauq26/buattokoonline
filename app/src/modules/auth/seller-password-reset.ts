import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { authRateLimitRealm, consumeAuthBucket } from "@/lib/auth/rate-limit";
import { HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import { lockRecoveryUser, recoveryUser, sellerAccount } from "./auth.service";
import { generateRegistrationOtp } from "./registration-otp";
import { registrationMailConfig, sendStoreMail } from "./registration-otp-email";

const prefix = "seller-otp:";
const grantPrefix = "seller-grant:";
const ttl = 300_000;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const namespace = () => `auth:${authRateLimitRealm()}:seller-reset`;

export async function sellerResetLimit(action: string, scope: string, value: string, limit: number) {
  const hour = Math.floor(Date.now() / 3_600_000);
  await consumeAuthBucket(`${namespace()}:${action}:${scope}:${digest(value)}:${hour}`, limit, new Date((hour + 1) * 3_600_000));
}

export function sellerOtpDigest(id: string, code: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new HttpError("Layanan pemulihan belum tersedia.", 503);
  return prefix + createHmac("sha256", secret).update(`${prefix}${id}:${code}`).digest("hex");
}

export async function deliverSellerReset(email: string, id: string) {
  const config = registrationMailConfig();
  const candidate = await recoveryUser(email, null);
  if (!candidate) return;
  const code = generateRegistrationOtp();
  const recipient = await prisma.$transaction(async tx => {
    await lockRecoveryUser(tx, candidate.id);
    const user = await tx.user.findFirst({ where: { id: candidate.id, email: candidate.email, ...sellerAccount } });
    if (!user) return null;
    const now = new Date();
    const recent = await tx.passwordResetToken.findFirst({ where: {
      userId: user.id, token: { startsWith: prefix }, createdAt: { gt: new Date(+now - 60_000) },
    } });
    if (recent) return null;
    await tx.passwordResetToken.deleteMany({ where: {
      userId: user.id, createdAt: { lt: new Date(+now - 86_400_000) },
      OR: [{ token: { startsWith: prefix } }, { token: { startsWith: grantPrefix } }],
    } });
    await tx.passwordResetToken.updateMany({ where: {
      userId: user.id, usedAt: null, OR: [{ token: { startsWith: prefix } }, { token: { startsWith: grantPrefix } }],
    }, data: { usedAt: now } });
    await tx.passwordResetToken.create({ data: {
      id, userId: user.id, token: sellerOtpDigest(id, code), expiresAt: now,
    } });
    return user.email;
  });
  if (!recipient) return;
  await sendStoreMail("seller-reset", recipient, code, config);
  // An accepted email is not a usable OTP until activation is persisted.
  // Retry a transient DB failure, while keeping the reserved code expired until success.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const activated = await prisma.passwordResetToken.updateMany({
        where: { id, usedAt: null, token: sellerOtpDigest(id, code) },
        data: { expiresAt: new Date(Date.now() + ttl) },
      });
      if (activated.count !== 1) {
        throw new HttpError("Kode OTP tidak dapat diaktifkan. Coba kirim ulang nanti.", 503);
      }
      console.info("auth.seller_reset.otp_sent");
      return;
    } catch (error) {
      if (attempt === 1 || error instanceof HttpError) {
        console.warn("auth.seller_reset.otp_activation_failed");
        throw error;
      }
    }
  }
}

const invalid = () => new HttpError("Kode salah, belum terkirim, atau kedaluwarsa. Periksa email atau kirim ulang.", 400);

export async function verifySellerReset(id: string, code: string) {
  const challenge = await prisma.passwordResetToken.findUnique({ where: { id } });
  if (!challenge || !challenge.token.startsWith(prefix) || challenge.usedAt || challenge.expiresAt <= new Date()) throw invalid();
  await sellerResetLimit("verify", "account", challenge.userId, 20);
  await consumeAuthBucket(`${namespace()}:attempt:${id}`, 5, challenge.expiresAt);
  return prisma.$transaction(async tx => {
    await lockRecoveryUser(tx, challenge.userId);
    const now = new Date();
    const current = await tx.passwordResetToken.findFirst({ where: {
      id, usedAt: null, expiresAt: { gt: now }, user: sellerAccount,
    } });
    if (!current || !current.token.startsWith(prefix)) throw invalid();
    if (!timingSafeEqual(Buffer.from(current.token), Buffer.from(sellerOtpDigest(id, code)))) throw invalid();
    const token = randomBytes(32).toString("hex");
    await tx.passwordResetToken.update({ where: { id }, data: { usedAt: now } });
    await tx.passwordResetToken.create({ data: {
      userId: current.userId, token: grantPrefix + digest(token), expiresAt: new Date(+now + ttl),
    } });
    return token;
  });
}

export async function completeSellerReset(token: string, password: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { token: grantPrefix + digest(token) } });
  const invalidGrant = () => new HttpError("Izin reset kedaluwarsa atau sudah digunakan. Mulai ulang.", 400);
  if (!record || record.usedAt || record.expiresAt <= new Date()) throw invalidGrant();
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async tx => {
    await lockRecoveryUser(tx, record.userId);
    const now = new Date();
    const grant = await tx.passwordResetToken.findFirst({ where: {
      id: record.id, usedAt: null, expiresAt: { gt: now }, user: sellerAccount,
    } });
    if (!grant) throw invalidGrant();
    const user = await tx.user.update({ where: { id: grant.userId }, data: {
      passwordHash, sessionVersion: { increment: 1 },
    } });
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    await writeAudit({ userId: user.id, action: "auth.seller_password.reset", entity: "User", entityId: user.id }, tx);
    return user.email;
  });
}

export async function notifySellerReset(email: string) {
  await sendStoreMail("seller-changed", email, "");
}
