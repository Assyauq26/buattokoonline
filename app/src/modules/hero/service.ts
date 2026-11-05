
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import { emptyHero, parseHero, type HeroConfig } from "./schema";
type Tx = Prisma.TransactionClient;
const json = (v: HeroConfig) => v as unknown as Prisma.InputJsonValue;
const referencedIds = (v: HeroConfig) =>
  v.slides.flatMap(s => [s.desktopAssetId, s.mobileAssetId]).filter((id): id is string => Boolean(id));
export const HERO_TAG = "storefront-hero-v1";

export async function readHeroDraft() {
  const row = await prisma.storeHero.findUnique({ where: { key: "primary" } });
  return {
    config: row ? parseHero(row.draft) : emptyHero(),
    draftVersion: row?.draftVersion ?? 0,
    publishedVersion: row?.publishedVersion ?? 0,
  };
}

export async function readHeroPublishedUncached() {
  const row = await prisma.storeHero.findUnique({
    where: { key: "primary" },
    select: { published: true, publishedVersion: true },
  });
  return { config: row ? parseHero(row.published) : emptyHero(), version: row?.publishedVersion ?? 0 };
}

export async function heroMediaReferenced(id: string) {
  const row = await prisma.storeHero.findUnique({ where: { key: "primary" } });
  return Boolean(row && [row.draft, row.published].some(v => referencedIds(parseHero(v)).includes(id)));
}

async function assertImages(tx: Tx, config: HeroConfig, actorId: string, sessionHash: string, existing: HeroConfig[]) {
  const trusted = new Set(existing.flatMap(referencedIds));
  for (const id of new Set(referencedIds(config))) {
    const asset = await tx.storeHeroAsset.findUnique({ where: { id } });
    if (!asset || !asset.ready || asset.retiredAt)
      throw new HttpError("Gambar banner tidak tersedia", 422);
    if (!trusted.has(id) && (asset.actorId !== actorId || asset.sessionHash !== sessionHash || asset.expiresAt <= new Date()))
      throw new HttpError("Gambar banner bukan milik sesi aktif", 403);
  }
}

export async function executeHeroChange(input: {
  kind: "save" | "publish" | "discard";
  draftVersion: number;
  publishedVersion: number;
  config?: unknown;
}, actorId: string, sessionHash: string) {
  if (!Number.isSafeInteger(input.draftVersion) || input.draftVersion < 0 ||
      !Number.isSafeInteger(input.publishedVersion) || input.publishedVersion < 0)
    throw new HttpError("Versi banner tidak valid", 422);
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('store-hero-v1'))::text`;
    await tx.storeHero.upsert({
      where: { key: "primary" },
      create: { key: "primary", draft: json(emptyHero()), published: json(emptyHero()) },
      update: {},
    });
    await tx.$queryRaw`SELECT "key" FROM "StoreHero" WHERE "key"='primary' FOR UPDATE`;
    const row = await tx.storeHero.findUniqueOrThrow({ where: { key: "primary" } });
    if (row.draftVersion !== input.draftVersion || row.publishedVersion !== input.publishedVersion)
      throw new HttpError("Banner telah diubah dari tab lain. Muat ulang sebelum melanjutkan.", 409);
    const oldDraft = parseHero(row.draft), oldPublished = parseHero(row.published);
    const config = input.kind === "save" ? parseHero(input.config)
      : input.kind === "discard" ? oldPublished : oldDraft;
    await assertImages(tx, config, actorId, sessionHash, [oldDraft, oldPublished]);
    if (input.kind === "publish" && config.enabled &&
        (!config.slides.length || config.slides.some(s => !s.desktopAssetId)))
      throw new HttpError("Tambahkan minimal satu banner dengan gambar desktop sebelum Publish.", 422);
    const publishing = input.kind === "publish";
    const updated = await tx.storeHero.update({
      where: { key: "primary" },
      data: publishing
        ? { published: json(config), publishedVersion: { increment: 1 } }
        : { draft: json(config), draftVersion: { increment: 1 } },
    });
    await writeAudit({
      userId: actorId, action: `store.hero.${input.kind}`, entity: "StoreHero",
      entityId: "primary",
      meta: { draftVersion: updated.draftVersion, publishedVersion: updated.publishedVersion, slideCount: config.slides.length },
    }, tx);
    return {
      config: parseHero(updated.draft), draftVersion: updated.draftVersion,
      publishedVersion: updated.publishedVersion,
    };
  }, { timeout: 10000 });
  return result;
}
