import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { storeOrigin } from "@/lib/store-config";
import { createSession, getCurrentUser } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { enforceAuthRateLimit } from "@/lib/auth/rate-limit";
import { authenticate } from "@/modules/auth/auth.service";
import { normalizeRegistrationPhone } from "@/modules/auth/registration-otp";
import { whatsappEnabled, whatsappRelay } from "./relay";

const COOKIE = "__Host-btos-wa";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const denied = () =>
  new HttpError(
    "Verifikasi tidak valid atau telah kedaluwarsa. Mulai kembali.",
    409,
  );
const customer = {
  isActive: true,
  deletedAt: null,
  emailVerifiedAt: { not: null },
  roles: {
    some: { role: { name: "Customer" } },
    none: { role: { name: { in: ADMIN_ROLES } } },
  },
};
const seller = {
  isActive: true,
  deletedAt: null,
  emailVerifiedAt: { not: null },
  roles: { some: { role: { name: { in: ADMIN_ROLES } } } },
};
function gate() {
  if (!whatsappEnabled())
    throw new HttpError("Login WhatsApp belum tersedia. Gunakan email.", 503);
}
async function cookieChallenge() {
  gate();
  const value = (await cookies()).get(COOKIE)?.value;
  const match = /^([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(value || "");
  if (!match) throw denied();
  const row = await prisma.whatsAppChallenge.findFirst({
    where: {
      id: match[1],
      browserHash: hash(match[2]),
      expiresAt: { gt: new Date() },
    },
  });
  if (!row) throw denied();
  return { row, proof: match[2] };
}
export async function startWhatsApp(input: {
  phone: string;
  purpose: "login" | "link";
  password?: string;
  accountType?: "customer" | "seller";
}) {
  gate();
  const accountType = input.accountType ?? "customer";
  const isSeller = accountType === "seller";
  const phone = normalizeRegistrationPhone(input.phone);
  await enforceAuthRateLimit("login", "wa:" + phone);
  let userId: string | undefined, sessionVersion: number | undefined;
  if (input.purpose === "link") {
    const current = await getCurrentUser(false);
    if (
      !current ||
      (isSeller
        ? !current.isAdmin
        : current.isAdmin || !current.roles.includes("Customer"))
    )
      throw new HttpError(
        "Masuk ke akun yang sesuai untuk menautkan nomor.",
        403,
      );
    const user = await authenticate(current.email, input.password || "");
    if (user.id !== current.id || !user.emailVerifiedAt || user.deletedAt)
      throw denied();
    userId = user.id;
    sessionVersion = user.sessionVersion;
  }
  const proof = randomBytes(32).toString("hex");
  const challenge = z
    .object({
      id: z.string().uuid(),
      expiresAt: z.coerce.date(),
      whatsappUrl: z.string().url(),
    })
    .parse(
      await whatsappRelay("auth/start", {
        phone,
        browserProof: proof,
        purpose: input.purpose,
      }),
    );
  const url = new URL(challenge.whatsappUrl);
  if (
    url.origin !== "https://wa.me" ||
    !/^\/[1-9]\d{7,14}$/.test(url.pathname) ||
    challenge.expiresAt.getTime() > Date.now() + 190000
  )
    throw denied();
  const row = await prisma.whatsAppChallenge.create({
    data: {
      accountType,
      centralId: challenge.id,
      phone,
      browserHash: hash(proof),
      purpose: input.purpose,
      userId,
      sessionVersion,
      expiresAt: challenge.expiresAt,
    },
  });
  (await cookies()).set(COOKIE, row.id + "." + proof, {
    secure: true,
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 600,
  });
  return {
    whatsappUrl: challenge.whatsappUrl,
    expiresAt: challenge.expiresAt,
    phone: "••••" + phone.slice(-4),
  };
}
export async function whatsAppStatus() {
  const { row, proof } = await cookieChallenge();
  if (row.state !== "pending") return { state: row.state };
  return z
    .object({
      state: z.enum([
        "waiting",
        "reply_queued",
        "reply_sent",
        "consumed",
        "locked",
        "expired",
      ]),
      expiresAt: z.coerce.date(),
    })
    .parse(
      await whatsappRelay("auth/status", {
        id: row.centralId,
        browserProof: proof,
      }),
    );
}
export async function finishWhatsApp(
  code?: string,
  confirmation?: { id: string; token: string },
) {
  const { row, proof } = await cookieChallenge();
  // Foreign request links must not lock or consume the current browser challenge.
  if (confirmation && confirmation.id !== row.centralId) throw denied();
  await enforceAuthRateLimit("registerConfirm", "wa:" + row.id);
  // Lock local completion before external exchange; a timeout is not retried blindly.
  const claimed = await prisma.whatsAppChallenge.updateMany({
    where: { id: row.id, state: "pending", expiresAt: { gt: new Date() } },
    data: { state: "exchanging" },
  });
  if (claimed.count !== 1) throw denied();
  let verified;
  try {
    const result = z
      .object({ exchange: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(
        await whatsappRelay("auth/finish", {
          id: row.centralId,
          browserProof: proof,
          ...(confirmation
            ? { confirmationToken: confirmation.token }
            : { code }),
        }),
      );
    verified = z
      .object({
        phone: z.string(),
        purpose: z.enum(["login", "link"]),
        transaction: z.string().uuid(),
        tenant: z.string().uuid(),
        audience: z.string().url(),
      })
      .parse(
        await whatsappRelay("auth/exchange", {
          exchange: result.exchange,
          browserProof: proof,
        }),
      );
  } catch (error) {
    // Wrong-code responses permit bounded retries. Ambiguous network failures
    // fail closed because the central exchange may already have been consumed.
    const wrongCode =
      error instanceof HttpError &&
      error.message === "Kode salah, sudah digunakan, atau kedaluwarsa.";
    await prisma.whatsAppChallenge.updateMany({
      where: { id: row.id, state: "exchanging" },
      data: { state: wrongCode ? "pending" : "failed" },
    });
    throw error;
  }
  if (
    verified.phone !== row.phone ||
    verified.purpose !== row.purpose ||
    verified.transaction !== row.centralId ||
    verified.tenant !== process.env.STORE_WHATSAPP_TENANT_ID ||
    verified.audience !== storeOrigin()
  ) {
    await prisma.whatsAppChallenge.update({
      where: { id: row.id },
      data: { state: "failed" },
    });
    throw denied();
  }
  const isSeller = row.accountType === "seller";
  const account = isSeller ? seller : customer;
  const current = row.purpose === "link" ? await getCurrentUser(false) : null;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WhatsAppChallenge" WHERE id=${row.id} FOR UPDATE`;
    const state = await tx.whatsAppChallenge.findUnique({
      where: { id: row.id },
    });
    if (state?.state !== "exchanging" || state.expiresAt <= new Date())
      throw denied();
    if (row.purpose === "link") {
      if (!current || current.id !== row.userId || current.isAdmin !== isSeller)
        throw denied();
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${current.id} FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: {
          id: current.id,
          sessionVersion: row.sessionVersion!,
          ...account,
        },
      });
      if (
        !user ||
        !user.phone ||
        normalizeRegistrationPhone(user.phone) !== row.phone
      )
        throw new HttpError(
          "Gunakan nomor yang tersimpan di profil Anda. Ubah profil terlebih dahulu jika nomor sudah berganti.",
          409,
        );
      const other = await tx.whatsAppIdentity.findUnique({
        where: { phone: row.phone },
      });
      if (other && other.userId !== user.id)
        throw new HttpError(
          "Nomor ini tidak dapat ditautkan. Gunakan pemulihan melalui email.",
          409,
        );
      const next = await tx.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
      });
      await tx.whatsAppIdentity.upsert({
        where: { userId: user.id },
        create: {
          accountType: row.accountType,
          userId: user.id,
          phone: row.phone,
          sessionVersion: next.sessionVersion,
        },
        update: {
          accountType: row.accountType,
          phone: row.phone,
          sessionVersion: next.sessionVersion,
          verifiedAt: new Date(),
          linkedAt: new Date(),
        },
      });
      await tx.whatsAppChallenge.update({
        where: { id: row.id },
        data: { state: "consumed" },
      });
      return { user: next, state: "linked" };
    }
    const identity = await tx.whatsAppIdentity.findUnique({
      where: { phone: row.phone },
    });
    if (identity && identity.accountType === row.accountType) {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${identity.userId} FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: {
          id: identity.userId,
          sessionVersion: identity.sessionVersion,
          ...account,
        },
      });
      // Password reset, changed phone, inactivity or role changes require account
      // proof again; possessing a recycled number alone never relinks an account.
      if (
        user &&
        user.phone &&
        normalizeRegistrationPhone(user.phone) === row.phone &&
        identity.verifiedAt.getTime() > Date.now() - 30 * 86400000
      ) {
        await tx.whatsAppIdentity.update({
          where: { userId: user.id },
          data: { verifiedAt: new Date() },
        });
        await tx.whatsAppChallenge.update({
          where: { id: row.id },
          data: { state: "consumed" },
        });
        return { user, state: "signed_in" };
      }
    }
    if (isSeller) {
      await tx.whatsAppChallenge.update({
        where: { id: row.id },
        data: { state: "failed" },
      });
      return { user: null, state: "seller_link_required" };
    }
    // Verified phone is only a pending proof. Existing accounts still need their
    // password; new accounts still complete the existing mandatory email OTP flow.
    await tx.whatsAppChallenge.update({
      where: { id: row.id },
      data: { state: "verified", expiresAt: new Date(Date.now() + 10 * 60000) },
    });
    return { user: null, state: "profile_required" };
  });
  if (result.user)
    await createSession(
      result.user.id,
      result.user.email,
      result.user.sessionVersion,
    );
  return {
    state: result.state,
    ...(result.user && isSeller ? { redirectTo: "/admin" } : {}),
  };
}
export async function unlinkWhatsApp(
  password: string,
  accountType: "customer" | "seller" = "customer",
) {
  gate();
  const current = await getCurrentUser(false);
  if (!current || current.isAdmin !== (accountType === "seller"))
    throw new HttpError("Masuk ke akun yang sesuai.", 403);
  const verified = await authenticate(current.email, password);
  if (verified.id !== current.id) throw denied();
  const user = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${current.id} FOR UPDATE`;
    await tx.whatsAppIdentity.deleteMany({ where: { userId: current.id } });
    await tx.whatsAppConsent.updateMany({
      where: { userId: current.id, granted: true },
      data: { granted: false, changedAt: new Date(), deliveredAt: null },
    });
    return tx.user.update({
      where: { id: current.id, sessionVersion: verified.sessionVersion },
      data: { sessionVersion: { increment: 1 } },
    });
  });
  await createSession(user.id, user.email, user.sessionVersion);
  return { state: "unlinked" };
}
