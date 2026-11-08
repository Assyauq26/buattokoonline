ALTER TABLE "BankAccount" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "BankAccount" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_deleted_inactive" CHECK ("deletedAt" IS NULL OR "isActive" = false);
