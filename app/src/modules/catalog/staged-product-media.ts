import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getObject, putObject, removeObject, STORAGE_APP } from "@/lib/storage";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { validateProductImage } from "./product-image-validation";
import type { CatalogActor } from "./product-management.validation";
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export type MediaContext = { sessionHash: string; requestId: string };
function canWrite(actor: CatalogActor, sessionHash: string) {
  if (
    !actor.isAdmin ||
    !actor.permissions.some(
      (p) =>
        p === PERMISSIONS.PRODUCT_CREATE || p === PERMISSIONS.PRODUCT_UPDATE,
    ) ||
    !/^[a-f0-9]{64}$/.test(sessionHash)
  )
    throw new HttpError("Anda tidak memiliki izin upload", 403);
}
function view(row: { id: string; expiresAt: Date }) {
  return {
    id: row.id,
    url: `/api/v1/admin/product-media/${row.id}`,
    alt: "",
    expiresAt: row.expiresAt.toISOString(),
  };
}
export async function readStagedMedia(
  actor: CatalogActor,
  sessionHash: string,
  id: string,
) {
  canWrite(actor, sessionHash);
  const row = await prisma.stagedProductMedia.findFirst({
    where: {
      id,
      actorId: actor.id,
      sessionHash,
      ready: true,
      productId: null,
      cancelledAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!row)
    throw new HttpError(
      "Foto sementara tidak tersedia atau sudah kedaluwarsa. Unggah kembali.",
      404,
    );
  return row;
}
export async function stageProductMedia(
  actor: CatalogActor,
  sessionHash: string,
  id: string,
  bytes: Uint8Array,
  mime: string,
  purpose: string,
) {
  canWrite(actor, sessionHash);
  if (!uuid.test(id) || !["gallery", "option"].includes(purpose))
    throw new HttpError("Identitas upload tidak valid", 422);
  const extension = validateProductImage(bytes, mime);
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  await cleanupStagedMedia();
  // Persist intent before touching Storage, so partial failures remain reconcilable/cleanable.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`media-owner:${actor.id}`}))::text`;
    const old = await tx.stagedProductMedia.findUnique({ where: { id } });
    if (old) return;
    if (
      (await tx.stagedProductMedia.count({
        where: {
          actorId: actor.id,
          productId: null,
          cancelledAt: null,
          expiresAt: { gt: new Date() },
        },
      })) >= 60
    )
      throw new HttpError(
        "Batas foto sementara tercapai. Hapus foto yang tidak dipakai.",
        429,
      );
    await tx.stagedProductMedia.create({
      data: {
        id,
        actorId: actor.id,
        sessionHash,
        contentHash,
        objectPath: `${STORAGE_APP}/product-images/staged-${id}/${id}.${extension}`,
        mime,
        purpose,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
  });
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`media:${id}`}))::text`;
      await tx.$queryRaw`SELECT id FROM "StagedProductMedia" WHERE id = ${id} FOR UPDATE`;
      let row = await tx.stagedProductMedia.findUnique({ where: { id } });
      if (
        row &&
        (row.actorId !== actor.id ||
          row.sessionHash !== sessionHash ||
          row.contentHash !== contentHash ||
          row.purpose !== purpose)
      )
        throw new HttpError("Identitas upload sudah digunakan", 409);
      if (
        row &&
        (row.cancelledAt || row.productId || row.expiresAt <= new Date())
      )
        throw new HttpError(
          "Upload kedaluwarsa atau sudah digunakan. Pilih file kembali.",
          409,
        );
      if (row?.ready) return view(row);
      if (!row) throw new HttpError("Upload tidak tersedia", 409);
      const objectPath = row.objectPath;
      try {
        await putObject(objectPath, bytes, mime, AbortSignal.timeout(15000));
      } catch {
        // Immutable object may have succeeded before transport failure; adopt only exact bytes.
        let matches = false;
        try {
          matches =
            createHash("sha256")
              .update(
                (await getObject(objectPath, AbortSignal.timeout(15000))).data,
              )
              .digest("hex") === contentHash;
        } catch {
          /* fail closed */
        }
        if (!matches)
          throw new HttpError(
            "Upload belum dapat dikonfirmasi. Coba lagi dengan file yang sama.",
            503,
          );
      }
      row = await tx.stagedProductMedia.update({
        where: { id },
        data: { ready: true },
      });
      return view(row);
    },
    { timeout: 45_000 },
  );
}
export async function cancelStagedMedia(
  actor: CatalogActor,
  sessionHash: string,
  id: string,
) {
  canWrite(actor, sessionHash);
  // Serializes with finalization; a committed image can never become a cleanup candidate.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StagedProductMedia" WHERE id = ${id} FOR UPDATE`;
    await tx.stagedProductMedia.updateMany({
      where: {
        id,
        actorId: actor.id,
        sessionHash,
        productId: null,
        cancelledAt: null,
      },
      data: { cancelledAt: new Date(), expiresAt: new Date() },
    });
  });
  const cancelled = await prisma.stagedProductMedia.findFirst({
    where: {
      id,
      actorId: actor.id,
      sessionHash,
      productId: null,
      cancelledAt: { not: null },
    },
  });
  if (cancelled) {
    try {
      await removeObject(cancelled.objectPath, AbortSignal.timeout(15000));
    } catch {
      /* Durable tombstone keeps the object eligible for reconciliation. */
    }
  }
  await cleanupStagedMedia();
}
/** Bounded, retryable cleanup; no object is removed before durable cancellation. */
export async function cleanupStagedMedia() {
  const summary = { scanned: 0, cancelled: 0, deleted: 0, failed: 0 };
  // An aborted HTTP PUT can still commit remotely. Keep cancelled identity for a
  // full day and delete again after that grace window instead of losing its path.
  const graceBefore = new Date(Date.now() - 24 * 60 * 60_000);
  const rows = await prisma.stagedProductMedia.findMany({
    where: {
      productId: null,
      expiresAt: { lte: new Date() },
      OR: [{ cancelledAt: null }, { cancelledAt: { lte: graceBefore } }],
    },
    take: 5,
    orderBy: { expiresAt: "asc" },
  });
  summary.scanned = rows.length;
  await Promise.all(
    rows.map(async (row) => {
      const claimed = await prisma.stagedProductMedia.updateMany({
        where: {
          id: row.id,
          productId: null,
          expiresAt: { lte: new Date() },
          cancelledAt: row.cancelledAt,
        },
        data: { cancelledAt: row.cancelledAt ?? new Date() },
      });
      if (!claimed.count) return;
      if (!row.cancelledAt) summary.cancelled++;
      try {
        await removeObject(row.objectPath, AbortSignal.timeout(15000));
        const deleted = await prisma.stagedProductMedia.deleteMany({
          where: {
            id: row.id,
            productId: null,
            cancelledAt: { lte: graceBefore },
          },
        });
        summary.deleted += deleted.count;
      } catch {
        summary.failed++;
        /* Keep cancelled metadata so an operator / next upload can retry cleanup. */
      }
    }),
  );
  return summary;
}
export async function finalizeStagedMedia(
  tx: Prisma.TransactionClient,
  actor: CatalogActor,
  sessionHash: string | undefined,
  productId: string,
  gallery: { id: string; alt: string }[],
  options: { id: string; alt: string }[],
) {
  const images = [
    ...gallery.map((i) => ({ ...i, purpose: "gallery" })),
    ...options.map((i) => ({ ...i, purpose: "option" })),
  ];
  const staged = await tx.stagedProductMedia.findMany({
    where: { id: { in: images.map((i) => i.id) }, productId: null },
  });
  if (!staged.length) return [];
  if (!sessionHash) throw new HttpError("Sesi pemilik foto diperlukan", 403);
  canWrite(actor, sessionHash);
  const finalized = [];
  for (const image of images) {
    const row = staged.find((s) => s.id === image.id);
    if (!row) continue;
    const result = await tx.stagedProductMedia.updateMany({
      where: {
        id: row.id,
        actorId: actor.id,
        sessionHash,
        purpose: image.purpose,
        ready: true,
        productId: null,
        cancelledAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { productId },
    });
    if (result.count !== 1)
      throw new HttpError(
        "Foto sementara bukan milik sesi ini, telah digunakan, atau kedaluwarsa. Unggah kembali.",
        409,
      );
    finalized.push(
      await tx.productImage.create({
        data: {
          id: row.id,
          productId,
          url: `/api/v1/product-images/${row.id}?object=${encodeURIComponent(row.objectPath)}`,
          alt: image.alt,
          isVariation: image.purpose === "option",
          sortOrder: images.indexOf(image),
        },
      }),
    );
  }
  return finalized;
}
export function savePayloadHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export async function readSaveReceipt(
  tx: Prisma.TransactionClient,
  actor: CatalogActor,
  ctx: MediaContext | undefined,
  payloadHash: string,
) {
  if (!ctx) return null;
  canWrite(actor, ctx.sessionHash);
  if (!uuid.test(ctx.requestId))
    throw new HttpError("Identitas penyimpanan tidak valid", 422);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`save:${ctx.requestId}`}))::text`;
  const saved = await tx.productEditorSave.findUnique({
    where: { id: ctx.requestId },
  });
  if (!saved) return null;
  if (
    saved.actorId !== actor.id ||
    saved.sessionHash !== ctx.sessionHash ||
    saved.payloadHash !== payloadHash
  )
    throw new HttpError(
      "Identitas penyimpanan sudah digunakan untuk data lain",
      409,
    );
  return saved.result;
}
export async function writeSaveReceipt(
  tx: Prisma.TransactionClient,
  actor: CatalogActor,
  ctx: MediaContext | undefined,
  payloadHash: string,
  result: object,
) {
  if (ctx)
    await tx.productEditorSave.create({
      data: {
        id: ctx.requestId,
        actorId: actor.id,
        sessionHash: ctx.sessionHash,
        payloadHash,
        result: result as Prisma.InputJsonValue,
      },
    });
}
