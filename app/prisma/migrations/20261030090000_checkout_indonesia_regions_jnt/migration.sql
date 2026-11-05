-- Additive and nullable: historical addresses and shipment/order data remain untouched.
SET lock_timeout = '5s';
SET statement_timeout = '30s';
ALTER TABLE "CustomerAddress"
  ADD COLUMN "provinceCode" TEXT, ADD COLUMN "cityCode" TEXT,
  ADD COLUMN "districtCode" TEXT, ADD COLUMN "villageCode" TEXT,
  ADD COLUMN "district" TEXT, ADD COLUMN "village" TEXT,
  ADD COLUMN "regionSource" TEXT, ADD COLUMN "regionUpdatedAt" TEXT;
ALTER TABLE "OrderAddress"
  ADD COLUMN "provinceCode" TEXT, ADD COLUMN "cityCode" TEXT,
  ADD COLUMN "districtCode" TEXT, ADD COLUMN "villageCode" TEXT,
  ADD COLUMN "district" TEXT, ADD COLUMN "village" TEXT,
  ADD COLUMN "regionSource" TEXT, ADD COLUMN "regionUpdatedAt" TEXT;
ALTER TABLE "Order"
  ADD COLUMN "shippingCourier" TEXT, ADD COLUMN "shippingService" TEXT,
  ADD COLUMN "shippingMode" TEXT, ADD COLUMN "shippingWeightGram" INTEGER,
  ADD COLUMN "shippingQuoteReference" TEXT;
RESET lock_timeout;
RESET statement_timeout;
