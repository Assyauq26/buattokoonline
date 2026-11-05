-- Additive metadata only. Existing products keep SQL NULL and all transaction tables are unchanged.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE "Product" ADD COLUMN "sizeChart" JSONB;
ALTER TABLE "Product" ADD CONSTRAINT "Product_sizeChart_size_check"
  CHECK ("sizeChart" IS NULL OR octet_length("sizeChart"::text) <= 100000);
COMMIT;
