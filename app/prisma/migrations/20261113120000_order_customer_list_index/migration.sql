-- Additive ordering index for the customer order list; no transaction rows change.
CREATE INDEX "Order_userId_createdAt_id_idx" ON "Order"("userId", "createdAt", "id");
