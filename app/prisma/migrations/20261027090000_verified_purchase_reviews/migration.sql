BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "Review" ADD COLUMN "orderItemId" TEXT;
CREATE UNIQUE INDEX "Review_orderItemId_key" ON "Review"("orderItemId");
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
