BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "packageHeightMm" INTEGER,
ADD COLUMN     "packageLengthMm" INTEGER,
ADD COLUMN     "packageWidthMm" INTEGER,
ADD COLUMN     "weightGrams" INTEGER;

-- CreateTable
CREATE TABLE "StagedProductMedia" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "objectPath" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StagedProductMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEditorSave" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEditorSave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StagedProductMedia_expiresAt_idx" ON "StagedProductMedia"("expiresAt");

-- CreateIndex
CREATE INDEX "StagedProductMedia_actorId_sessionHash_idx" ON "StagedProductMedia"("actorId", "sessionHash");


ALTER TABLE "Product" ADD CONSTRAINT "Product_weightGrams_check" CHECK ("weightGrams" IS NULL OR "weightGrams" BETWEEN 1 AND 1000000),
  ADD CONSTRAINT "Product_packageDimensions_check" CHECK (
    ("packageLengthMm" IS NULL AND "packageWidthMm" IS NULL AND "packageHeightMm" IS NULL) OR
    ("packageLengthMm" IS NOT NULL AND "packageWidthMm" IS NOT NULL AND "packageHeightMm" IS NOT NULL AND
    "packageLengthMm" BETWEEN 1 AND 100000 AND "packageWidthMm" BETWEEN 1 AND 100000 AND "packageHeightMm" BETWEEN 1 AND 100000));
ALTER TABLE "StagedProductMedia" ADD CONSTRAINT "StagedProductMedia_purpose_check" CHECK (purpose IN ('gallery','option')),
  ADD CONSTRAINT "StagedProductMedia_hash_check" CHECK ("sessionHash" ~ '^[a-f0-9]{64}$' AND "contentHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "ProductEditorSave" ADD CONSTRAINT "ProductEditorSave_hash_check" CHECK ("sessionHash" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "StagedProductMedia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductEditorSave" ENABLE ROW LEVEL SECURITY;
-- No public policies: only the trusted server role may operate these tables.
COMMIT;
