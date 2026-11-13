import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { storeOrigin } from "@/lib/store-config";
import { assertStaffPermission } from "@/modules/orders/transaction-locks";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { lockSource, requirePreview, storeScope } from "./repository";
import { seal, unseal } from "./secrets";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
function config() {
  requirePreview();
  if (process.env.PAYMENT_GMAIL_OAUTH_TEST !== "true")
    throw new HttpError(
      "OAuth Gmail belum dibuka untuk pengujian operator",
      503,
    );
  const origin = new URL(storeOrigin());
  if (
    origin.protocol !== "https:" ||
    origin.pathname !== "/" ||
    origin.username ||
    origin.password
  )
    throw new HttpError("OAuth memerlukan origin HTTPS resmi", 503);
  const clientId = process.env.PAYMENT_GOOGLE_CLIENT_ID,
    secret = process.env.PAYMENT_GOOGLE_CLIENT_SECRET;
  if (!clientId || !secret)
    throw new HttpError("Klien Google OAuth belum dikonfigurasi operator", 503);
  return {
    clientId,
    secret,
    redirect: `${origin.origin}/api/v1/admin/payment-evidence/oauth/callback`,
  };
}
async function browserSession() {
  const token = (await cookies()).get(
    process.env.AUTH_COOKIE_NAME || "store_session",
  )?.value;
  if (!token) throw new HttpError("Sesi wajib tersedia", 401);
  return createHash("sha256").update(token).digest("hex");
}
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

export async function beginGoogleOAuth(actorId: string, sourceId: string) {
  const cfg = config(),
    session = await browserSession();
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.BANK_MANAGE);
    const source = await lockSource(tx, sourceId);
    if (source.kind !== "GMAIL_BANK")
      throw new HttpError("Sumber bukan Gmail bank", 422);
    await tx.paymentEvidenceOAuthState.deleteMany({ where: { sourceId } });
    await tx.paymentEvidenceOAuthState.create({
      data: {
        digest: digest(state + session),
        sourceId,
        actorId,
        generation: source.generation,
        encryptedVerifier: seal(
          verifier,
          storeScope(),
          sourceId,
          "oauth-verifier",
        ),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirect,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: digestBase64(verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}
const digestBase64 = (s: string) =>
  createHash("sha256").update(s).digest("base64url");
const tokenSchema = z.object({
  access_token: z.string().min(1).max(16000),
  refresh_token: z.string().min(1).max(16000).optional(),
  expires_in: z.number().int().positive().max(86400),
  token_type: z.literal("Bearer"),
  scope: z.string().optional(),
});
export type GoogleTokens = {
  access: string;
  refresh: string;
  expiresAt: number;
};
async function tokenRequest(params: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: params,
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok)
    throw new HttpError(
      response.status === 400 || response.status === 401
        ? "Google meminta hubungkan ulang"
        : "Google sementara tidak tersedia",
      response.status === 400 || response.status === 401 ? 409 : 503,
    );
  const parsed = tokenSchema.safeParse(await boundedJson(response));
  if (
    !parsed.success ||
    (parsed.data.scope && !parsed.data.scope.split(" ").includes(SCOPE))
  )
    throw new HttpError("Respons Google tidak sesuai izin baca Gmail", 502);
  return parsed.data;
}
export async function completeGoogleOAuth(
  actorId: string,
  state: string,
  code: string,
) {
  const cfg = config(),
    session = await browserSession();
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096)
    throw new HttpError("Callback OAuth tidak valid", 422);
  // Consume before networking. Failed/replayed callbacks require a fresh consent flow.
  const challenge = await prisma.$transaction(async (tx) => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.BANK_MANAGE);
    const row = await tx.paymentEvidenceOAuthState.findUnique({
      where: { digest: digest(state + session) },
    });
    if (!row || row.actorId !== actorId || row.expiresAt <= new Date())
      throw new HttpError("Sesi OAuth berakhir atau tidak cocok", 409);
    const source = await lockSource(tx, row.sourceId);
    if (
      source.storeScope !== storeScope() ||
      source.kind !== "GMAIL_BANK" ||
      source.generation !== row.generation
    )
      throw new HttpError("Konfigurasi telah berubah", 409);
    const consumed = await tx.paymentEvidenceOAuthState.deleteMany({
      where: { digest: row.digest },
    });
    if (consumed.count !== 1)
      throw new HttpError("Sesi OAuth sudah digunakan", 409);
    return row;
  });
  const tokens = await tokenRequest(
    new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.secret,
      redirect_uri: cfg.redirect,
      code,
      grant_type: "authorization_code",
      code_verifier: unseal(
        challenge.encryptedVerifier,
        storeScope(),
        challenge.sourceId,
        "oauth-verifier",
      ),
    }),
  );
  try {
    if (!tokens.refresh_token)
      throw new HttpError(
        "Google belum memberikan akses offline; hubungkan ulang",
        409,
      );
    const encrypted = seal(
      JSON.stringify({
        access: tokens.access_token,
        refresh: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      } satisfies GoogleTokens),
      storeScope(),
      challenge.sourceId,
      "google-tokens",
    );
    await prisma.$transaction(async (tx) => {
      await assertStaffPermission(tx, actorId, PERMISSIONS.BANK_MANAGE);
      const source = await lockSource(tx, challenge.sourceId);
      if (source.generation !== challenge.generation)
        throw new HttpError("Konfigurasi berubah saat OAuth berlangsung", 409);
      await tx.paymentEvidenceSource.update({
        where: { id: source.id },
        data: {
          encryptedSecret: encrypted,
          generation: { increment: 1 },
          health: "CONNECTED_PARSER_BLOCKED",
          enabled: false,
          leaseToken: null,
          leaseUntil: null,
        },
      });
      await tx.paymentEvidenceReview.create({
        data: {
          sourceId: source.id,
          actorId,
          action: "GOOGLE_CONNECTED",
          reason:
            "Akses baca disimpan; parser bank dan checkout tetap nonaktif.",
        },
      });
    });
  } catch (error) {
    // Consent can finish after a concurrent disconnect or permission change.
    // Never leave an issued token usable merely because local persistence failed.
    let revoked = false;
    try {
      revoked = await revokeGoogle(tokens.refresh_token || tokens.access_token);
    } catch {}
    // Revocation can affect another consent for the same Google app/account;
    // conservatively require reconnect if a newer local connection exists.
    await prisma.paymentEvidenceSource.updateMany({
      where: {
        id: challenge.sourceId,
        storeScope: storeScope(),
        encryptedSecret: { not: null },
      },
      data: { health: "RECONNECT_REQUIRED" },
    });
    await prisma.paymentEvidenceReview.create({
      data: {
        sourceId: challenge.sourceId,
        actorId,
        action: revoked ? "DISCARDED_OAUTH_REVOKED" : "REMOTE_REVOKE_REQUIRED",
        reason: revoked
          ? "Token dari callback yang dibatalkan dicabut; koneksi paralel perlu diperiksa ulang."
          : "Callback dibatalkan; cabut akses melalui Keamanan Akun Google karena pencabutan jarak jauh belum terkonfirmasi.",
      },
    });
    throw error;
  }
}
export async function refreshGoogle(
  tokens: GoogleTokens,
): Promise<GoogleTokens> {
  if (tokens.expiresAt > Date.now() + 60_000) return tokens;
  const cfg = config();
  const next = await tokenRequest(
    new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.secret,
      refresh_token: tokens.refresh,
      grant_type: "refresh_token",
    }),
  );
  return {
    access: next.access_token,
    refresh: next.refresh_token || tokens.refresh,
    expiresAt: Date.now() + next.expires_in * 1000,
  };
}
export async function revokeGoogle(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    body: new URLSearchParams({ token: refreshToken }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    cache: "no-store",
  });
  // Already-invalid tokens are effectively revoked; never log the response body.
  return response.ok || response.status === 400;
}
export async function boundedJson(
  response: Pick<Response, "body">,
  max = 256_000,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError("Respons sumber kosong", 502);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > max) {
      await reader.cancel();
      throw new HttpError("Respons sumber terlalu besar", 502);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError("Respons sumber tidak valid", 502);
  }
}

/** Fixed Google origin; no user-provided URLs, server-only tokens, bounded pagination.
 * Query filters are privacy preferences, never a sender/authentication trust proof. */
export async function listGmailMessages(
  access: string,
  since: Date,
  pageToken?: string,
) {
  const url = new URL(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages",
  );
  url.search = new URLSearchParams({
    maxResults: "50",
    q: `after:${Math.floor(since.getTime() / 1000)}`,
    ...(pageToken ? { pageToken } : {}),
  }).toString();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${access}` },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok)
    throw new HttpError(
      response.status === 401
        ? "Gmail meminta hubungkan ulang"
        : "Gmail sementara tidak tersedia",
      response.status === 401 ? 409 : 503,
    );
  return z
    .object({
      messages: z
        .array(
          z.object({
            id: z.string().min(1).max(256),
            threadId: z.string().optional(),
          }),
        )
        .max(50)
        .optional(),
      nextPageToken: z.string().max(4096).optional(),
    })
    .parse(await boundedJson(response));
}
