BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- CreateTable
CREATE TABLE "CheckoutIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestSecretHash" TEXT,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIntent_orderId_key" ON "CheckoutIntent"("orderId");

-- CreateIndex
CREATE INDEX "CheckoutIntent_expiresAt_idx" ON "CheckoutIntent"("expiresAt");

-- CreateIndex
CREATE INDEX "CheckoutIntent_userId_idx" ON "CheckoutIntent"("userId");

-- AddForeignKey
ALTER TABLE "CheckoutIntent" ADD CONSTRAINT "CheckoutIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only trusted server roles may operate on intents. No public client policies.
ALTER TABLE "CheckoutIntent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CheckoutIntent" ADD CONSTRAINT "CheckoutIntent_quantity_check" CHECK ("quantity" BETWEEN 1 AND 999);
ALTER TABLE "CheckoutIntent" ADD CONSTRAINT "CheckoutIntent_owner_check" CHECK (
  ("userId" IS NOT NULL AND "guestSecretHash" IS NULL) OR
  ("userId" IS NULL AND "guestSecretHash" IS NOT NULL AND "guestSecretHash" ~ '^[a-f0-9]{64}$')
);
ALTER TABLE "CheckoutIntent" ADD CONSTRAINT "CheckoutIntent_consumed_check" CHECK (
  ("consumedAt" IS NULL AND "orderId" IS NULL) OR
  ("consumedAt" IS NOT NULL AND "orderId" IS NOT NULL AND "userId" IS NOT NULL)
);
COMMIT;
