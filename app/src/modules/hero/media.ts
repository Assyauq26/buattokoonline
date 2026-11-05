
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { STORAGE_APP, putObject, getObject, removeObject } from "@/lib/storage";
import { normalizeLogo, MAX_LOGO_BYTES } from "@/modules/appearance/media";
import { rateLimit } from "@/modules/appearance/service";
import { writeAudit } from "@/modules/audit/audit.service";
import { heroMediaReferenced } from "./service";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_HERO_BYTES = MAX_LOGO_BYTES;

export async function uploadHeroImage(actorId: string, sessionHash: string, requestId: string, bytes: Uint8Array, mime: string) {
  if (!UUID.test(requestId)) throw new HttpError("Request ID tidak valid", 422);
  await rateLimit(actorId, "hero-upload", 24, 3600);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const existing = await prisma.storeHeroAsset.findUnique({
    where: { actorId_sessionHash_requestId: { actorId, sessionHash, requestId } },
  });
  if (existing) {
    if (existing.checksum !== checksum || !existing.ready || existing.retiredAt || existing.expiresAt <= new Date())
      throw new HttpError("ID upload sudah digunakan atau kedaluwarsa", 409);
    return { id: existing.id };
  }
  const content = await normalizeLogo(bytes, mime);
  const id = randomUUID(), path = `${STORAGE_APP}/store-branding/${actorId}/${id}.webp`;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`hero-media:${actorId}`}))::text`;
    const count = await tx.storeHeroAsset.count({
      where: { actorId, sessionHash, ready: true, retiredAt: null, expiresAt: { gt: new Date() } },
    });
    if (count >= 24) throw new HttpError("Batas upload banner per sesi tercapai", 429);
    await tx.storeHeroAsset.create({
      data: { id, actorId, sessionHash, requestId, path, checksum, size: content.length, expiresAt: new Date(Date.now() + 172800000) },
    });
  });
  try {
    await putObject(path, content, "image/webp");
    await prisma.$transaction(async tx => {
      await tx.storeHeroAsset.update({ where: { id }, data: { ready: true } });
      await writeAudit({ userId: actorId, action: "store.hero.media.upload", entity: "StoreHeroAsset", entityId: id }, tx);
    });
    return { id };
  } catch (error) {
    let removed = false;
    try { await removeObject(path); removed = true; } catch {}
    if (removed) await prisma.storeHeroAsset.delete({ where: { id } }).catch(() => {});
    throw error;
  }
}

export async function readHeroImage(id: string, actor?: { id: string; sessionHash: string }) {
  if (!UUID.test(id)) throw new HttpError("Banner tidak ditemukan", 404);
  const asset = await prisma.storeHeroAsset.findUnique({ where: { id } });
  if (!asset?.ready || asset.retiredAt) throw new HttpError("Banner tidak ditemukan", 404);
  const row = await prisma.storeHero.findUnique({ where: { key: "primary" } });
  const publishedConfig = row?.publishedVersion ? (await import("./schema")).parseHero(row.published) : null;
  const publishedIds = publishedConfig?.enabled
    ? publishedConfig.slides.flatMap(s => [s.desktopAssetId, s.mobileAssetId])
    : [];
  const publicReady = publishedIds.includes(id);
  if (!publicReady) {
    if (!actor) throw new HttpError("Banner tidak ditemukan", 404);
    const draftReferenced = await heroMediaReferenced(id);
    if (!draftReferenced && !(asset.actorId === actor.id && asset.sessionHash === actor.sessionHash && asset.expiresAt > new Date()))
      throw new HttpError("Banner tidak ditemukan", 404);
  }
  return getObject(asset.path);
}

export async function cleanupHeroMedia() {
  // Exclude assets retained by draft/published slides BEFORE limiting the
  // batch. Otherwise a hundred expired-but-in-use banners starve cleanup.
  const expired = await prisma.$queryRaw<{id:string;path:string}[]>`
    SELECT a."id", a."path" FROM "StoreHeroAsset" a
    WHERE a."expiresAt" < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM "StoreHero" h,
          LATERAL jsonb_array_elements(h."draft"->'slides') slide
        WHERE slide->>'desktopAssetId' = a."id"::text
           OR slide->>'mobileAssetId' = a."id"::text
      )
      AND NOT EXISTS (
        SELECT 1 FROM "StoreHero" h,
          LATERAL jsonb_array_elements(h."published"->'slides') slide
        WHERE slide->>'desktopAssetId' = a."id"::text
           OR slide->>'mobileAssetId' = a."id"::text
      )
    ORDER BY a."expiresAt" ASC, a."id" ASC LIMIT 100
  `;
  let removed = 0;
  for (const asset of expired) {
    if (await heroMediaReferenced(asset.id)) continue;
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('store-hero-v1'))::text`;
      const row = await tx.storeHero.findUnique({ where: { key: "primary" } });
      const parse = (await import("./schema")).parseHero;
      if (row && [row.draft, row.published].some(v =>
        parse(v).slides.some(s => s.desktopAssetId === asset.id || s.mobileAssetId === asset.id))) return;
      const current = await tx.storeHeroAsset.findUnique({ where: { id: asset.id } });
      if (!current || current.expiresAt >= new Date()) return;
      await removeObject(asset.path);
      await tx.storeHeroAsset.delete({ where: { id: asset.id } });
      removed++;
    }, { timeout: 10000 });
  }
  return { removed };
}
