-- Additive promotion data. Existing product-wide campaigns retain their behavior.
ALTER TABLE "FlashSaleCampaign" ADD COLUMN "draft" JSONB;
CREATE TABLE "FlashSaleSkuOffer" (
  "id" UUID PRIMARY KEY,
  "itemId" UUID NOT NULL REFERENCES "FlashSaleCampaignItem"("id") ON DELETE CASCADE,
  "variantId" TEXT NOT NULL REFERENCES "ProductVariant"("id") ON DELETE RESTRICT,
  "price" INTEGER NOT NULL CHECK ("price" > 0),
  "quota" INTEGER NOT NULL CHECK ("quota" > 0)
);
CREATE UNIQUE INDEX "FlashSaleSkuOffer_itemId_variantId_key" ON "FlashSaleSkuOffer"("itemId", "variantId");
CREATE INDEX "FlashSaleSkuOffer_variantId_idx" ON "FlashSaleSkuOffer"("variantId");
ALTER TABLE "FlashSaleSkuOffer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" ADD COLUMN "flashOfferId" UUID REFERENCES "FlashSaleSkuOffer"("id") ON DELETE RESTRICT;
CREATE INDEX "OrderItem_flashOfferId_idx" ON "OrderItem"("flashOfferId");
