import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import { contrastErrors } from "./contrast";
import {
  legacyDefault,
  makeDefault,
  parseAppearance,
  type StoreAppearanceV1,
} from "./schema";

import { initialPublishedAppearance } from "./initial";

type Tx = Prisma.TransactionClient;
export const asJson = (value: StoreAppearanceV1) =>
  value as unknown as Prisma.InputJsonValue;
export async function rateLimit(
  actor: string,
  operation: string,
  max: number,
  seconds: number,
) {
  const slot = Math.floor(Date.now() / (seconds * 1000));
  const rows = await prisma.$queryRaw<
    { count: number }[]
  >`INSERT INTO "StoreCustomizeRateLimit" ("key","count","expiresAt") VALUES (${`${operation}:${actor}:${slot}`},1,${new Date((slot + 1) * seconds * 1000)}) ON CONFLICT ("key") DO UPDATE SET "count"="StoreCustomizeRateLimit"."count"+1 RETURNING "count"`;
  if (rows[0].count > max)
    throw new HttpError("Terlalu banyak percobaan. Coba lagi nanti.", 429);
}
export async function readPublishedUncached() {
  const row = await prisma.storeAppearance.findUnique({
    where: { key: "primary" },
    select: { published: true, publishedVersion: true },
  });
  const config = row ? parseAppearance(row.published) : initialPublishedAppearance();
  return {
    config,
    version: row?.publishedVersion ?? 0,
    legacy: JSON.stringify(config) === JSON.stringify(legacyDefault()),
  };
}
export async function readDraft() {
  const row = await prisma.storeAppearance.findUnique({
    where: { key: "primary" },
  });
  return {
    config: row ? parseAppearance(row.draft) : initialPublishedAppearance(),
    publishedConfig: row ? parseAppearance(row.published) : initialPublishedAppearance(),
    draftVersion: row?.draftVersion ?? 0,
    publishedVersion: row?.publishedVersion ?? 0,
  };
}
async function locked(tx: Tx) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('store-appearance-v1'))::text`;
  await tx.storeAppearance.upsert({
    where: { key: "primary" },
    create: {
      key: "primary",
      // Match the empty-store fallback; existing merchant records are never overwritten.
      draft: asJson(initialPublishedAppearance()),
      published: asJson(initialPublishedAppearance()),
    },
    update: {},
  });
  await tx.$queryRaw`SELECT "key" FROM "StoreAppearance" WHERE "key"='primary' FOR UPDATE`;
  return await tx.storeAppearance.findUniqueOrThrow({
    where: { key: "primary" },
  });
}
async function assertAsset(
  tx: Tx,
  config: StoreAppearanceV1,
  actorId: string,
  sessionHash: string,
) {
  const id = config.identity.logoAssetId;
  if (!id) return;
  const asset = await tx.storeBrandAsset.findUnique({ where: { id } });
  if (!asset || !asset.ready || asset.retiredAt)
    throw new HttpError("Logo tidak tersedia", 422);
  const row = await tx.storeAppearance.findUnique({
    where: { key: "primary" },
  });
  const referenced =
    [row?.draft, row?.published].some(
      (v) => v && parseAppearance(v).identity.logoAssetId === id,
    ) ||
    Boolean(
      await tx.storeAppearanceRevision.findFirst({
        where: { config: { path: ["identity", "logoAssetId"], equals: id } },
      }),
    );
  if (
    !referenced &&
    (asset.actorId !== actorId ||
      asset.sessionHash !== sessionHash ||
      asset.expiresAt <= new Date())
  )
    throw new HttpError(
      "Logo bukan milik sesi ini atau sudah kedaluwarsa",
      403,
    );
}
export async function changeAppearance(
  input: {
    kind: "save" | "discard" | "reset" | "publish" | "rollback";
    draftVersion: number;
    publishedVersion: number;
    config?: unknown;
    revision?: number;
  },
  actorId: string,
  sessionHash: string,
) {
  if (
    !Number.isSafeInteger(input.draftVersion) ||
    input.draftVersion < 0 ||
    !Number.isSafeInteger(input.publishedVersion) ||
    input.publishedVersion < 0
  )
    throw new HttpError("Versi tidak valid", 422);
  await rateLimit(
    actorId,
    input.kind,
    input.kind === "publish" || input.kind === "rollback" ? 10 : 60,
    60,
  );
  try {
    return await prisma.$transaction(
      async (tx) => {
        const row = await locked(tx);
        if (
          row.draftVersion !== input.draftVersion ||
          row.publishedVersion !== input.publishedVersion
        )
          throw new HttpError(
            "Draft atau published berubah di tab/admin lain. Muat ulang sebelum melanjutkan.",
            409,
          );
        await tx.storeAppearanceRevision.upsert({
          where: { version: 0 },
          create: {
            version: 0,
            config: asJson(parseAppearance(row.published)),
            actorId,
            action: "baseline",
          },
          update: {},
        });
        let config: StoreAppearanceV1;
        if (input.kind === "save") config = parseAppearance(input.config);
        else if (input.kind === "reset") {
          config = makeDefault();
          config.identity = parseAppearance(row.draft).identity;
        }
        else if (input.kind === "discard")
          config = parseAppearance(row.published);
        else if (input.kind === "rollback") {
          if (!Number.isSafeInteger(input.revision) || input.revision! < 0)
            throw new HttpError("Revisi tidak valid", 422);
          const revision = await tx.storeAppearanceRevision.findUnique({
            where: { version: input.revision },
          });
          if (!revision) throw new HttpError("Revisi tidak ditemukan", 404);
          config = parseAppearance(revision.config);
        } else config = parseAppearance(row.draft);
        await assertAsset(tx, config, actorId, sessionHash);
        const publishing =
          input.kind === "publish" || input.kind === "rollback";
        // Version zero is a compatibility snapshot; rollback may restore it exactly.
        if (
          publishing &&
          !(input.kind === "rollback" && input.revision === 0)
        ) {
          const errors = contrastErrors(config);
          if (errors.length)
            throw new HttpError(
              `Kontras belum valid: ${errors.join("; ")}`,
              422,
            );
          if (config.identity.mode !== "text" && !config.identity.logoAssetId)
            throw new HttpError("Upload logo atau pilih mode teks", 422);
        }
        const updated = await tx.storeAppearance.update({
          where: { key: "primary" },
          data: publishing
            ? { published: asJson(config), publishedVersion: { increment: 1 } }
            : { draft: asJson(config), draftVersion: { increment: 1 } },
        });
        if (publishing && config.identity.name !== parseAppearance(row.published).identity.name) {
          const pending = {
            revision: updated.publishedVersion,
            name: config.identity.name,
            attempts: 0,
            nextAttempt: new Date(),
            syncedAt: null,
            status: "pending",
          };
          await tx.storeMailBrandSync.upsert({
            where: { id: 1 },
            create: { id: 1, ...pending },
            update: pending,
          });
        }
        if (publishing)
          await tx.storeAppearanceRevision.create({
            data: {
              version: updated.publishedVersion,
              config: asJson(config),
              actorId,
              action: input.kind,
            },
          });
        await writeAudit(
          {
            userId: actorId,
            action: `store.customize.${input.kind}`,
            entity: "StoreAppearance",
            entityId: "primary",
            meta: {
              draftVersion: updated.draftVersion,
              publishedVersion: updated.publishedVersion,
            },
          },
          tx,
        );
        return {
          config: parseAppearance(updated.draft),
          publishedConfig: parseAppearance(updated.published),
          draftVersion: updated.draftVersion,
          publishedVersion: updated.publishedVersion,
        };
      },
      { timeout: 10000 },
    );
  } catch (error) {
    await writeAudit({
      userId: actorId,
      action: `store.customize.${input.kind}.failed`,
      entity: "StoreAppearance",
      entityId: "primary",
      meta: { status: error instanceof HttpError ? error.status : 500 },
    });
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    )
      throw new HttpError(
        "Perubahan bersamaan terdeteksi. Muat ulang draft.",
        409,
      );
    throw error;
  }
}
