import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { assertStaffPermission } from "@/modules/orders/transaction-locks";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { lockSource, requirePreview, storeScope } from "./repository";
import { validateStaticQris } from "./qris";
import { unseal } from "./secrets";
import { revokeGoogle, type GoogleTokens } from "./google";

export const sourceInput = z
  .object({
    kind: z.enum(["GOPAY_QRIS", "GMAIL_BANK"]),
    label: z.string().trim().min(2).max(80),
    accountRef: z.string().trim().min(1).max(100),
    staticQris: z.string().max(4096).optional(),
  })
  .strict();
export async function createSource(actorId: string, raw: unknown) {
  requirePreview();
  const input = sourceInput.parse(raw);
  if (input.kind === "GOPAY_QRIS") {
    try {
      validateStaticQris(input.staticQris || "");
    } catch (error) {
      throw new HttpError(
        error instanceof Error ? error.message : "QRIS tidak valid",
        422,
      );
    }
  } else if (input.staticQris)
    throw new HttpError("QRIS tidak berlaku untuk bank", 422);
  return prisma.$transaction(async (tx) => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.BANK_MANAGE);
    let accountRef = input.accountRef;
    let bankAccountId: string | undefined;
    if (input.kind === "GMAIL_BANK") {
      const bank = await tx.bankAccount.findFirst({
        where: { id: input.accountRef, isActive: true, deletedAt: null },
      });
      if (!bank) throw new HttpError("Pilih versi rekening aktif", 422);
      bankAccountId = bank.id;
      // Stable receiving-account identity survives the bank editor's immutable
      // version replacement. A second version must not create a second claim scope.
      accountRef = createHash("sha256")
        .update(JSON.stringify(["IDR", bank.accountNumber.replace(/\s/g, "")]))
        .digest("hex");
    }
    const duplicate = await tx.paymentEvidenceSource.findUnique({
      where: {
        storeScope_kind_accountRef: {
          storeScope: storeScope(),
          kind: input.kind,
          accountRef,
        },
      },
    });
    if (duplicate)
      throw new HttpError(
        "Sumber pembayaran ini sudah dikonfigurasi. Gunakan koneksi yang ada.",
        409,
      );
    const source = await tx.paymentEvidenceSource.create({
      data: {
        ...input,
        accountRef,
        bankAccountId,
        storeScope: storeScope(),
        enabled: false,
      },
    });
    await tx.paymentEvidenceReview.create({
      data: {
        sourceId: source.id,
        actorId,
        action: "DRAFT_CREATED",
        reason: "Draf konfigurasi disimpan; belum ditawarkan di checkout.",
      },
    });
    return { id: source.id };
  });
}
export async function disconnectSource(actorId: string, sourceId: string) {
  requirePreview();
  const secret = await prisma.$transaction(async (tx) => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.BANK_MANAGE);
    const source = await lockSource(tx, sourceId);
    await tx.paymentEvidenceSource.update({
      where: { id: sourceId },
      data: {
        enabled: false,
        encryptedSecret: null,
        generation: { increment: 1 },
        leaseToken: null,
        leaseUntil: null,
        cursor: null,
        health: "DISCONNECTED",
      },
    });
    await tx.paymentEvidenceOAuthState.deleteMany({ where: { sourceId } });
    await tx.paymentEvidenceReview.create({
      data: {
        sourceId,
        actorId,
        action: "DISCONNECTED",
        reason:
          "Akses lokal dihapus dan worker lama dibatalkan; histori dipertahankan.",
      },
    });
    return { encrypted: source.encryptedSecret, kind: source.kind };
  });
  let revoked = !secret.encrypted;
  if (secret.encrypted && secret.kind === "GMAIL_BANK") {
    try {
      const tokens = JSON.parse(
        unseal(secret.encrypted, storeScope(), sourceId, "google-tokens"),
      ) as GoogleTokens;
      revoked = await revokeGoogle(tokens.refresh);
    } catch {
      revoked = false;
    }
  }
  // Local disconnection succeeds even if Google is unavailable. Report remote state honestly.
  if (!revoked)
    await prisma.paymentEvidenceReview.create({
      data: {
        sourceId,
        actorId,
        action: "REMOTE_REVOKE_REQUIRED",
        reason:
          "Cabut akses dari Akun Google > Keamanan > Koneksi pihak ketiga; pencabutan jarak jauh belum terkonfirmasi.",
      },
    });
  return { disconnected: true, remoteRevoked: revoked };
}
