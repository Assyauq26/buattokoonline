CREATE TABLE "StoreMailBrandSync" (
    "id" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "StoreMailBrandSync_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "StoreMailBrandSync" ENABLE ROW LEVEL SECURITY;
