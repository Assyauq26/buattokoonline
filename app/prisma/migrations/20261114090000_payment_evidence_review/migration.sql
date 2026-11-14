BEGIN;
-- CreateTable
CREATE TABLE "PaymentEvidenceSource" (
    "id" TEXT NOT NULL,
    "storeScope" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "encryptedSecret" TEXT,
    "staticQris" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "health" TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
    "lastCheckedAt" TIMESTAMP(3),
    "nextPollAt" TIMESTAMP(3),
    "failures" INTEGER NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentEvidenceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvidenceAttempt" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "uniqueCode" INTEGER NOT NULL,
    "payable" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "retainUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvidenceAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingPaymentEvidence" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "bankTxId" TEXT,
    "messageId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "amount" INTEGER,
    "currency" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingPaymentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvidenceClaim" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvidenceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvidenceReview" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceId" TEXT,
    "attemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvidenceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvidenceOAuthState" (
    "digest" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "encryptedVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentEvidenceOAuthState_pkey" PRIMARY KEY ("digest")
);

-- CreateIndex
CREATE INDEX "PaymentEvidenceSource_storeScope_nextPollAt_idx" ON "PaymentEvidenceSource"("storeScope", "nextPollAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvidenceSource_storeScope_kind_accountRef_key" ON "PaymentEvidenceSource"("storeScope", "kind", "accountRef");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvidenceAttempt_paymentId_key" ON "PaymentEvidenceAttempt"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentEvidenceAttempt_sourceId_retainUntil_payable_idx" ON "PaymentEvidenceAttempt"("sourceId", "retainUntil", "payable");

-- CreateIndex
CREATE INDEX "IncomingPaymentEvidence_sourceId_createdAt_idx" ON "IncomingPaymentEvidence"("sourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingPaymentEvidence_sourceId_externalId_key" ON "IncomingPaymentEvidence"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingPaymentEvidence_sourceId_bankTxId_key" ON "IncomingPaymentEvidence"("sourceId", "bankTxId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingPaymentEvidence_sourceId_messageId_key" ON "IncomingPaymentEvidence"("sourceId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvidenceClaim_evidenceId_key" ON "PaymentEvidenceClaim"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvidenceClaim_attemptId_key" ON "PaymentEvidenceClaim"("attemptId");

-- CreateIndex
CREATE INDEX "PaymentEvidenceReview_sourceId_createdAt_idx" ON "PaymentEvidenceReview"("sourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentEvidenceAttempt" ADD CONSTRAINT "PaymentEvidenceAttempt_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PaymentEvidenceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidenceAttempt" ADD CONSTRAINT "PaymentEvidenceAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingPaymentEvidence" ADD CONSTRAINT "IncomingPaymentEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PaymentEvidenceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidenceClaim" ADD CONSTRAINT "PaymentEvidenceClaim_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "IncomingPaymentEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidenceClaim" ADD CONSTRAINT "PaymentEvidenceClaim_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentEvidenceAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidenceReview" ADD CONSTRAINT "PaymentEvidenceReview_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PaymentEvidenceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidenceOAuthState" ADD CONSTRAINT "PaymentEvidenceOAuthState_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PaymentEvidenceSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Independent of application validation; only new empty tables are constrained.
ALTER TABLE "PaymentEvidenceSource" ADD CONSTRAINT "PaymentEvidenceSource_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentEvidenceSource" ADD CONSTRAINT "payment_evidence_source_kind"
  CHECK ("kind" IN ('GOPAY_QRIS', 'GMAIL_BANK'));
ALTER TABLE "PaymentEvidenceSource" ADD CONSTRAINT "payment_evidence_disabled_draft"
  CHECK ("enabled" = FALSE);
ALTER TABLE "PaymentEvidenceAttempt" ADD CONSTRAINT "payment_evidence_integer_amounts"
  CHECK ("baseAmount" > 0 AND "uniqueCode" BETWEEN 1 AND 999
    AND "payable"::bigint = "baseAmount"::bigint + "uniqueCode"::bigint
    AND "expiresAt" > "createdAt" AND "retainUntil" >= "expiresAt" + INTERVAL '7 days');
ALTER TABLE "IncomingPaymentEvidence" ADD CONSTRAINT "payment_evidence_nonnegative_amount"
  CHECK ("amount" IS NULL OR "amount" >= 0);
ALTER TABLE "PaymentEvidenceClaim" ADD CONSTRAINT "payment_evidence_review_reason"
  CHECK (length(trim("reason")) BETWEEN 15 AND 1000);
COMMIT;
