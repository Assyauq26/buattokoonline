-- A standalone statement is required: Prisma 5 sends a migration file
-- as one query; PostgreSQL rejects CONCURRENTLY in multi-statement blocks.
-- No explicit transaction wrapper must surround this statement.
CREATE INDEX CONCURRENTLY "Order_couponCode_userId_idx" ON "Order"("couponCode", "userId");
