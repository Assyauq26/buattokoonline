-- Existing verified numbers remain customer-only; seller linking requires password proof.
ALTER TABLE "WhatsAppIdentity" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'customer' CHECK ("accountType" IN ('customer','seller'));
ALTER TABLE "WhatsAppChallenge" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'customer' CHECK ("accountType" IN ('customer','seller'));
