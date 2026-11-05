-- Existing coupons remain unlimited and immediately eligible by default.
ALTER TABLE "Coupon" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "Coupon" ADD COLUMN "usageLimit" INTEGER;
ALTER TABLE "Coupon" ADD COLUMN "perUserLimit" INTEGER;

-- Explicit DB constraints protect against invalid counts outside the application.
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_usageLimit_positive" CHECK ("usageLimit" IS NULL OR "usageLimit" > 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_perUserLimit_positive" CHECK ("perUserLimit" IS NULL OR "perUserLimit" > 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_schedule_order" CHECK ("startsAt" IS NULL OR "expiresAt" IS NULL OR "startsAt" < "expiresAt");
