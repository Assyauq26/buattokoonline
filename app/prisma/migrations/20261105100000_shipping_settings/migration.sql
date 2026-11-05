BEGIN;

CREATE TABLE "ShippingSettings" (
    "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
    "manualFlat" INTEGER CHECK ("manualFlat" BETWEEN 0 AND 100000000),
    "activeJntId" VARCHAR(36),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "legacyMappingVersion" VARCHAR(64)
);
INSERT INTO "ShippingSettings" ("id", "legacyMappingVersion")
VALUES (1, (SELECT "activeVersion" FROM "JntMappingRelease" WHERE "key" = 'primary'));

CREATE TABLE "JntCheckoutRevision" (
    "id" VARCHAR(36) PRIMARY KEY,
    "environment" VARCHAR(16) NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "mappingVersion" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "ShippingSettings" ADD CONSTRAINT "ShippingSettings_activeJntId_fkey" FOREIGN KEY ("activeJntId") REFERENCES "JntCheckoutRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD COLUMN "jntCheckoutRevisionId" VARCHAR(36);
ALTER TABLE "Order" ADD CONSTRAINT "Order_jntCheckoutRevisionId_fkey" FOREIGN KEY ("jntCheckoutRevisionId") REFERENCES "JntCheckoutRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JntIntegration" ADD COLUMN "tariffProof" TEXT, ADD COLUMN "legacyEncryptedConfig" TEXT;
UPDATE "JntIntegration" SET "legacyEncryptedConfig" = "encryptedConfig" WHERE "enabled";
ALTER TABLE "JntL3Mapping" ADD COLUMN "sendSiteCode" VARCHAR(80), ADD COLUMN "originCityCode" VARCHAR(3), ADD COLUMN "destAreaCode" VARCHAR(80);

CREATE TABLE "JntMappingImport" (
    "version" VARCHAR(64) PRIMARY KEY,
    "checksum" VARCHAR(64) NOT NULL,
    "filename" VARCHAR(180) NOT NULL,
    "source" VARCHAR(240) NOT NULL,
    "uploadedBy" VARCHAR(128) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "report" JSONB NOT NULL,
    "file" BYTEA NOT NULL
);

COMMIT;
