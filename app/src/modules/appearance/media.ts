import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getObject, putObject, removeObject, STORAGE_APP } from "@/lib/storage";
import { HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import { parseAppearance } from "./schema";
import { rateLimit } from "./service";
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export async function normalizeLogo(bytes: Uint8Array, mime: string) {
  const b = Buffer.from(bytes);
  const actual = b
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : b[0] === 255 && b[1] === 216 && b[2] === 255
      ? "image/jpeg"
      : b.toString("ascii", 0, 4) === "RIFF" &&
          b.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : null;
  if (!b.length || b.length > MAX_LOGO_BYTES || !actual || actual !== mime)
    throw new HttpError("Logo harus PNG/JPEG/WebP, maksimal 2 MiB", 422);
  if (
    (actual === "image/png" &&
      !b
        .subarray(-12)
        .equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]))) ||
    (actual === "image/jpeg" && !(b.at(-2) === 255 && b.at(-1) === 217)) ||
    (actual === "image/webp" && b.readUInt32LE(4) + 8 !== b.length)
  )
    throw new HttpError(
      "Gambar berisi data tambahan yang tidak diizinkan",
      422,
    );
  // Reject animation envelopes even if a codec would silently decode only frame one.
  if (actual === "image/png" || actual === "image/webp") {
    let offset = actual === "image/png" ? 8 : 12;
    while (offset + (actual === "image/png" ? 12 : 8) <= b.length) {
      const png = actual === "image/png",
        length = png ? b.readUInt32BE(offset) : b.readUInt32LE(offset + 4);
      const kind = b.toString(
        "ascii",
        offset + (png ? 4 : 0),
        offset + (png ? 8 : 4),
      );
      if (offset + length + (png ? 12 : 8) > b.length)
        throw new HttpError("Struktur gambar tidak valid", 422);
      if (
        kind === "acTL" ||
        kind === "ANIM" ||
        kind === "ANMF" ||
        (!png && kind === "VP8X" && length > 0 && (b[offset + 8] & 2) !== 0)
      )
        throw new HttpError("Logo animasi tidak diizinkan", 422);
      offset += length + (png ? 12 : 8) + (png ? 0 : length % 2);
    }
  }
  try {
    const image = sharp(b, {
        limitInputPixels: 16000000,
        failOn: "warning",
        animated: true,
      }),
      meta = await image.metadata();
    if (
      !meta.width ||
      !meta.height ||
      meta.width > 4096 ||
      meta.height > 4096 ||
      (meta.pages ?? 1) !== 1
    )
      throw new Error("Invalid dimensions or frames");
    const out = await image.rotate().webp({ quality: 90 }).toBuffer();
    if (out.length > MAX_LOGO_BYTES) throw new Error("Output too large");
    return out;
  } catch {
    throw new HttpError(
      "Gambar rusak, animasi, atau dimensinya terlalu besar",
      422,
    );
  }
}
export async function uploadLogo(
  actorId: string,
  sessionHash: string,
  requestId: string,
  bytes: Uint8Array,
  mime: string,
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  )
    throw new HttpError("Request ID tidak valid", 422);
  await rateLimit(actorId, "logo", 20, 3600);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const previous = await prisma.storeBrandAsset.findUnique({
    where: {
      actorId_sessionHash_requestId: { actorId, sessionHash, requestId },
    },
  });
  if (previous) {
    if (
      previous.checksum !== checksum ||
      !previous.ready ||
      previous.retiredAt ||
      previous.expiresAt <= new Date()
    )
      throw new HttpError("Upload ID sudah digunakan atau kedaluwarsa", 409);
    return { id: previous.id };
  }
  const normalized = await normalizeLogo(bytes, mime);
  const id = randomUUID(),
    path = `${STORAGE_APP}/store-branding/${actorId}/${id}.webp`;
  await prisma.$transaction(async (tx) => {
    // Serialize per actor: max active staging cannot race across tabs.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`store-logo:${actorId}`}))::text`;
    if (
      await tx.storeBrandAsset.findUnique({
        where: {
          actorId_sessionHash_requestId: { actorId, sessionHash, requestId },
        },
      })
    )
      throw new HttpError(
        "Upload ID masih diproses. Coba lagi dengan ID yang sama.",
        409,
      );
    if (
      (await tx.storeBrandAsset.count({
        where: {
          actorId,
          sessionHash,
          retiredAt: null,
          expiresAt: { gt: new Date() },
        },
      })) >= 10
    )
      throw new HttpError("Maksimal 10 logo staging aktif per sesi", 429);
    await tx.storeBrandAsset.create({
      data: {
        id,
        actorId,
        sessionHash,
        requestId,
        path,
        checksum,
        size: normalized.length,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  });
  try {
    await putObject(path, normalized, "image/webp");
    await prisma.$transaction(async (tx) => {
      await tx.storeBrandAsset.update({ where: { id }, data: { ready: true } });
      await writeAudit(
        {
          userId: actorId,
          action: "store.customize.media.upload",
          entity: "StoreBrandAsset",
          entityId: id,
          meta: { size: normalized.length },
        },
        tx,
      );
    });
    return { id };
  } catch (error) {
    let removed = false;
    try {
      await removeObject(path);
      removed = true;
    } catch {
      /* Keep reservation for TTL retry. */
    }
    if (removed)
      await prisma.storeBrandAsset.delete({ where: { id } }).catch(() => {});
    throw error;
  }
}
export async function assetReferenced(id: string) {
  const row = await prisma.storeAppearance.findUnique({
    where: { key: "primary" },
  });
  return Boolean(
    [row?.draft, row?.published].some(
      (v) => v && parseAppearance(v).identity.logoAssetId === id,
    ) ||
      (await prisma.storeAppearanceRevision.findFirst({
        where: { config: { path: ["identity", "logoAssetId"], equals: id } },
      })),
  );
}
export async function readLogo(
  id: string,
  actor?: { id: string; sessionHash: string },
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new HttpError("Logo tidak ditemukan", 404);
  const asset = await prisma.storeBrandAsset.findUnique({ where: { id } });
  if (!asset?.ready || asset.retiredAt)
    throw new HttpError("Logo tidak ditemukan", 404);
  const row = await prisma.storeAppearance.findUnique({
    where: { key: "primary" },
    select: { published: true },
  });
  const published =
    row && parseAppearance(row.published).identity.logoAssetId === id;
  if (
    !published &&
    (!actor ||
      !(
        (await assetReferenced(id)) ||
        (asset.actorId === actor.id &&
          asset.sessionHash === actor.sessionHash &&
          asset.expiresAt > new Date())
      ))
  )
    throw new HttpError("Logo tidak ditemukan", 404);
  return getObject(asset.path);
}
export async function retireLogo(
  id: string,
  actorId: string,
  sessionHash: string,
) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('store-appearance-v1'))::text`;
    // Same appearance row lock as save/publish; a concurrent attach cannot lose its bytes.
    await tx.$queryRaw`SELECT "key" FROM "StoreAppearance" WHERE "key"='primary' FOR UPDATE`;
    const row = await tx.storeAppearance.findUnique({
      where: { key: "primary" },
    });
    if (
      [row?.draft, row?.published].some(
        (v) => v && parseAppearance(v).identity.logoAssetId === id,
      ) ||
      (await tx.storeAppearanceRevision.findFirst({
        where: { config: { path: ["identity", "logoAssetId"], equals: id } },
      }))
    )
      throw new HttpError("Logo masih dipakai draft atau riwayat", 409);
    const result = await tx.storeBrandAsset.updateMany({
      where: { id, actorId, sessionHash, retiredAt: null },
      data: {
        retiredAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    if (!result.count) throw new HttpError("Logo tidak ditemukan", 404);
    await writeAudit(
      {
        userId: actorId,
        action: "store.customize.media.retire",
        entity: "StoreBrandAsset",
        entityId: id,
      },
      tx,
    );
  });
}
/** Run only from the explicitly guarded operator cleanup entrypoint. */
export async function cleanupBranding() {
  // Exclude logos still referenced by the shared draft, published theme or
  // immutable revision history BEFORE limiting the cleanup batch. Otherwise
  // 100 old, retained logos permanently starve all newer expired uploads.
  // Keep the in-transaction reference check below: this query is only a
  // candidate scan and a concurrent publish may attach one in the meantime.
  const rows = await prisma.$queryRaw<{ id: string; path: string }[]>`
    SELECT asset."id", asset."path"
    FROM "StoreBrandAsset" AS asset
    WHERE asset."expiresAt" < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM "StoreAppearance" AS appearance
        WHERE appearance."key" = 'primary'
          AND (
            appearance."draft"->'identity'->>'logoAssetId' = asset."id"::text
            OR appearance."published"->'identity'->>'logoAssetId' = asset."id"::text
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM "StoreAppearanceRevision" AS revision
        WHERE revision."config"->'identity'->>'logoAssetId' = asset."id"::text
      )
    ORDER BY asset."expiresAt" ASC, asset."id" ASC
    LIMIT 100
  `;
  let removed = 0;
  for (const asset of rows) {
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('store-appearance-v1'))::text`;
        // A candidate can change or disappear after the initial selection.
        const currentAsset = await tx.storeBrandAsset.findUnique({
          where: { id: asset.id },
        });
        if (!currentAsset || currentAsset.expiresAt >= new Date()) return;
        const row = await tx.storeAppearance.findUnique({
          where: { key: "primary" },
        });
        if (
          [row?.draft, row?.published].some(
            (v) => v && parseAppearance(v).identity.logoAssetId === asset.id,
          ) ||
          (await tx.storeAppearanceRevision.findFirst({
            where: {
              config: { path: ["identity", "logoAssetId"], equals: asset.id },
            },
          }))
        )
          return;
        // Storage deletion precedes row deletion; failures leave a retryable record.
        await removeObject(asset.path);
        await tx.storeBrandAsset.delete({ where: { id: asset.id } });
        await writeAudit(
          {
            action: "store.customize.media.cleanup",
            entity: "StoreBrandAsset",
            entityId: asset.id,
          },
          tx,
        );
        removed++;
      },
      { timeout: 10000 },
    );
  }
  await prisma.storeCustomizeRateLimit.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return { removed };
}
