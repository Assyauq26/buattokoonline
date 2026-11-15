BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';
ALTER TABLE "PaymentEvidenceAttempt"
  ADD COLUMN "qrisPayload" TEXT,
  ADD COLUMN "qrisId" TEXT,
  ADD COLUMN "trxId" TEXT,
  ADD COLUMN "merchantName" TEXT;
CREATE UNIQUE INDEX "PaymentEvidenceAttempt_qrisId_key" ON "PaymentEvidenceAttempt"("qrisId");
CREATE UNIQUE INDEX "PaymentEvidenceAttempt_trxId_key" ON "PaymentEvidenceAttempt"("trxId");
ALTER TABLE "PaymentEvidenceAttempt" ADD CONSTRAINT "qris_attempt_complete"
  CHECK (("qrisPayload" IS NULL AND "qrisId" IS NULL AND "trxId" IS NULL AND "merchantName" IS NULL)
    OR ("qrisPayload" IS NOT NULL AND "qrisId" IS NOT NULL AND "trxId" IS NOT NULL AND "merchantName" IS NOT NULL));
ALTER TABLE "PaymentEvidenceSource" DROP CONSTRAINT "payment_evidence_blu_opt_in";
ALTER TABLE "PaymentEvidenceSource" ADD CONSTRAINT "payment_evidence_connected_opt_in"
  CHECK (NOT "enabled" OR ("encryptedSecret" IS NOT NULL AND "automationActorId" IS NOT NULL
    AND (("kind"='GMAIL_BANK' AND "bankAccountId" IS NOT NULL)
      OR ("kind"='GOPAY_QRIS' AND "staticQris" IS NOT NULL AND length("accountRef")>0))));
COMMIT;
