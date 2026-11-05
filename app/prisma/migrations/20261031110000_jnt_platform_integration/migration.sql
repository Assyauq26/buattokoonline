-- Store-owned J&T configuration. No plaintext carrier credentials.
SET lock_timeout = '5s';
SET statement_timeout = '30s';
CREATE TABLE "JntIntegration" (
    "environment" VARCHAR(16) NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" VARCHAR(128),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JntIntegration_pkey" PRIMARY KEY ("environment"),
    CONSTRAINT "JntIntegration_environment_check" CHECK ("environment" IN ('sandbox', 'production'))
);
RESET lock_timeout;
RESET statement_timeout;
