BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE TABLE "StoreHero" (
  "key" VARCHAR(16) PRIMARY KEY DEFAULT 'primary' CHECK ("key" = 'primary'),
  "draft" JSONB NOT NULL CHECK (octet_length("draft"::text) <= 40000),
  "published" JSONB NOT NULL CHECK (octet_length("published"::text) <= 40000),
  "draftVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("draftVersion" >= 0),
  "publishedVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("publishedVersion" >= 0),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "StoreHeroAsset" (
  "id" UUID PRIMARY KEY,
  "actorId" VARCHAR(128) NOT NULL,
  "sessionHash" VARCHAR(64) NOT NULL,
  "requestId" UUID NOT NULL,
  "path" VARCHAR(400) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" > 0 AND "size" <= 2097152),
  "ready" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StoreHeroAsset_path_key" ON "StoreHeroAsset"("path");
CREATE UNIQUE INDEX "StoreHeroAsset_actorId_sessionHash_requestId_key"
  ON "StoreHeroAsset"("actorId","sessionHash","requestId");
CREATE INDEX "StoreHeroAsset_expiresAt_idx" ON "StoreHeroAsset"("expiresAt");
ALTER TABLE "StoreHero" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreHeroAsset" ENABLE ROW LEVEL SECURITY;
COMMIT;
