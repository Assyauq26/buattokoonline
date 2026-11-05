-- Additive migration: all existing products retain their original prices.
ALTER TABLE "Product"
  ADD COLUMN "flashSalePrice" INTEGER,
  ADD COLUMN "flashSaleStartsAt" TIMESTAMP(3),
  ADD COLUMN "flashSaleEndsAt" TIMESTAMP(3);

-- Either all schedule components are supplied or none.
ALTER TABLE "Product" ADD CONSTRAINT "Product_flash_sale_window" CHECK (
  ("flashSalePrice" IS NULL AND "flashSaleStartsAt" IS NULL AND "flashSaleEndsAt" IS NULL)
  OR
  ("flashSalePrice" IS NOT NULL AND "flashSaleStartsAt" IS NOT NULL AND "flashSaleEndsAt" IS NOT NULL AND "flashSalePrice" > 0 AND "flashSaleStartsAt" < "flashSaleEndsAt")
);
