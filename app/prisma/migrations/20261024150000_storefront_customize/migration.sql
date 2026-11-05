BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE TABLE "StoreAppearance" (
 "key" VARCHAR(16) PRIMARY KEY DEFAULT 'primary' CHECK ("key" = 'primary'),
 "draft" JSONB NOT NULL CHECK (octet_length("draft"::text) <= 40000),
 "published" JSONB NOT NULL CHECK (octet_length("published"::text) <= 40000),
 "draftVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("draftVersion" >= 0),
 "publishedVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("publishedVersion" >= 0),
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "StoreAppearanceRevision" (
 "id" UUID PRIMARY KEY, "version" INTEGER NOT NULL CHECK ("version" >= 0), "config" JSONB NOT NULL CHECK (octet_length("config"::text) <= 40000),
 "actorId" VARCHAR(128), "action" VARCHAR(24) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StoreAppearanceRevision_version_key" ON "StoreAppearanceRevision"("version");
CREATE TABLE "StoreBrandAsset" (
 "id" UUID PRIMARY KEY, "actorId" VARCHAR(128) NOT NULL, "sessionHash" VARCHAR(64) NOT NULL,
 "requestId" UUID NOT NULL, "path" VARCHAR(400) NOT NULL, "checksum" VARCHAR(64) NOT NULL,
 "size" INTEGER NOT NULL CHECK ("size" > 0 AND "size" <= 2097152), "ready" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL, "retiredAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "StoreBrandAsset_path_key" ON "StoreBrandAsset"("path");
CREATE UNIQUE INDEX "StoreBrandAsset_actorId_sessionHash_requestId_key" ON "StoreBrandAsset"("actorId", "sessionHash", "requestId");
CREATE INDEX "StoreBrandAsset_expiresAt_idx" ON "StoreBrandAsset"("expiresAt");
CREATE TABLE "StoreCustomizeRateLimit" ("key" VARCHAR(200) PRIMARY KEY, "count" INTEGER NOT NULL CHECK ("count" > 0), "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "StoreCustomizeRateLimit_expiresAt_idx" ON "StoreCustomizeRateLimit"("expiresAt");
ALTER TABLE "StoreAppearance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreAppearanceRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreBrandAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreCustomizeRateLimit" ENABLE ROW LEVEL SECURITY;
INSERT INTO "Permission" ("id", "key", "label") VALUES
 ('store_customize_read_v1','store.customize.read','Customize: read'),
 ('store_customize_update_v1','store.customize.update','Customize: update'),
 ('store_customize_publish_v1','store.customize.publish','Customize: publish') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId")
 SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
 WHERE r."name" IN ('Admin') AND p."key" IN ('store.customize.read','store.customize.update','store.customize.publish')
 ON CONFLICT DO NOTHING;
COMMIT;
