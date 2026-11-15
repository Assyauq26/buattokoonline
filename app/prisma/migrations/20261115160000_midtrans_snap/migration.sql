-- Additive integration; existing orders, payment snapshots and historical SQL remain unchanged.
CREATE TABLE "MidtransConfiguration" (
 "id" TEXT PRIMARY KEY, "storeScope" TEXT NOT NULL, "environment" TEXT NOT NULL,
 "merchantId" TEXT NOT NULL, "clientKey" TEXT NOT NULL, "serverKeyEnvelope" TEXT NOT NULL,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MidtransConfiguration_environment_check" CHECK ("environment" IN ('sandbox','production'))
);
CREATE TABLE "MidtransSetting" (
 "storeScope" TEXT PRIMARY KEY, "configId" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT false,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "MidtransSetting_configuration_check" CHECK (NOT "enabled" OR "configId" IS NOT NULL),
 CONSTRAINT "MidtransSetting_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MidtransConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "MidtransAttempt" (
 "id" TEXT PRIMARY KEY, "paymentId" TEXT NOT NULL, "configId" TEXT NOT NULL,
 "providerOrderId" TEXT NOT NULL, "amount" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'IDR',
 "state" TEXT NOT NULL DEFAULT 'NEW', "providerStatus" TEXT, "fraudStatus" TEXT, "channel" TEXT,
 "transactionId" TEXT, "transactionIdentity" TEXT, "snapEnvelope" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "creationStartedAt" TIMESTAMP(3),
 "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastCheckedAt" TIMESTAMP(3), "lastError" TEXT, "closedAt" TIMESTAMP(3),
 CONSTRAINT "MidtransAttempt_amount_check" CHECK ("amount" > 0 AND "currency" = 'IDR'),
 CONSTRAINT "MidtransAttempt_providerOrderId_check" CHECK ("providerOrderId" ~ '^[A-Za-z0-9._~-]{1,50}$'),
 CONSTRAINT "MidtransAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "MidtransAttempt_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MidtransConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "MidtransEvent" (
 "id" TEXT PRIMARY KEY, "attemptId" TEXT NOT NULL, "kind" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "data" JSONB NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "processedAt" TIMESTAMP(3), "lastError" TEXT,
 CONSTRAINT "MidtransEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "MidtransAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MidtransConfiguration_realm_created_idx" ON "MidtransConfiguration"("storeScope", "environment", "merchantId", "createdAt");
CREATE UNIQUE INDEX "MidtransAttempt_providerOrderId_key" ON "MidtransAttempt"("providerOrderId");
CREATE UNIQUE INDEX "MidtransAttempt_transactionIdentity_key" ON "MidtransAttempt"("transactionIdentity");
-- One live attempt per payment, including before the first provider request.
CREATE UNIQUE INDEX "MidtransAttempt_one_open_payment" ON "MidtransAttempt"("paymentId") WHERE "closedAt" IS NULL;
CREATE INDEX "MidtransAttempt_nextCheckAt_idx" ON "MidtransAttempt"("nextCheckAt");
CREATE INDEX "MidtransAttempt_paymentId_createdAt_idx" ON "MidtransAttempt"("paymentId", "createdAt");
CREATE UNIQUE INDEX "MidtransEvent_fingerprint_key" ON "MidtransEvent"("fingerprint");
CREATE INDEX "MidtransEvent_attemptId_receivedAt_idx" ON "MidtransEvent"("attemptId", "receivedAt");
