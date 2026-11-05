-- Additive: preserve existing payments and enum values. Apply before deploying new code.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
