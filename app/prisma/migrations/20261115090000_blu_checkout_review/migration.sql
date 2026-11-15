BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';
-- Existing draft migration and every historical checksum stay untouched.
ALTER TABLE "PaymentEvidenceSource" ADD COLUMN "automationActorId" TEXT;
ALTER TABLE "PaymentEvidenceSource" DROP CONSTRAINT "payment_evidence_disabled_draft";
-- QRIS remains unavailable. Activation requires a connected bank/account and
-- an accountable staff owner; application checks current permissions as well.
ALTER TABLE "PaymentEvidenceSource" ADD CONSTRAINT "payment_evidence_blu_opt_in"
  CHECK (NOT "enabled" OR ("kind" = 'GMAIL_BANK' AND "bankAccountId" IS NOT NULL
    AND "encryptedSecret" IS NOT NULL AND "automationActorId" IS NOT NULL));
COMMIT;
