BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE "FlashSaleControl" ("key" VARCHAR(16) PRIMARY KEY DEFAULT 'primary' CHECK ("key"='primary'));
INSERT INTO "FlashSaleControl" ("key") VALUES ('primary');
CREATE TABLE "FlashSaleCampaign" (
 "id" UUID PRIMARY KEY, "storeKey" VARCHAR(16) NOT NULL DEFAULT 'primary' CHECK ("storeKey"='primary'),
 "name" VARCHAR(120) NOT NULL CHECK (char_length(btrim("name")) BETWEEN 2 AND 120),
 "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','SCHEDULED','CANCELLED','ENDED')),
 "startsAt" TIMESTAMPTZ(3) NOT NULL, "endsAt" TIMESTAMPTZ(3) NOT NULL CHECK ("endsAt">"startsAt"),
 "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version">=0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FlashSaleCampaign_no_overlap" EXCLUDE USING gist (tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE ("status"='SCHEDULED')
);
CREATE INDEX "FlashSaleCampaign_status_startsAt_endsAt_idx" ON "FlashSaleCampaign"("status","startsAt","endsAt");
CREATE TABLE "FlashSaleCampaignItem" (
 "id" UUID PRIMARY KEY, "campaignId" UUID NOT NULL REFERENCES "FlashSaleCampaign"("id") ON DELETE CASCADE,
 "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT,
 "flashSalePrice" INTEGER NOT NULL CHECK ("flashSalePrice">0)
);
CREATE UNIQUE INDEX "FlashSaleCampaignItem_campaignId_productId_key" ON "FlashSaleCampaignItem"("campaignId","productId");
CREATE INDEX "FlashSaleCampaignItem_productId_idx" ON "FlashSaleCampaignItem"("productId");
CREATE TABLE "FlashSaleLegacy" (
 "productId" TEXT PRIMARY KEY, "snapshot" JSONB NOT NULL,
 "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedCampaignId" UUID
);
-- Archive only. No master-price rewrite, schedule coalescing or automatic activation.
INSERT INTO "FlashSaleLegacy" ("productId","snapshot")
 SELECT "id", jsonb_build_object('isFlashSale',"isFlashSale",'salePrice',"salePrice",'flashSalePrice',"flashSalePrice",'flashSaleStartsAt',"flashSaleStartsAt",'flashSaleEndsAt',"flashSaleEndsAt")
 FROM "Product" WHERE "isFlashSale" OR "flashSalePrice" IS NOT NULL OR "flashSaleStartsAt" IS NOT NULL OR "flashSaleEndsAt" IS NOT NULL;
ALTER TABLE "FlashSaleCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FlashSaleCampaignItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FlashSaleControl" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FlashSaleLegacy" ENABLE ROW LEVEL SECURITY;
COMMIT;
