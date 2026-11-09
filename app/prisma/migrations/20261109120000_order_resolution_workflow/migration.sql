ALTER TABLE "Shipment" ADD COLUMN "sellerHandoverAt" TIMESTAMP(3), ADD COLUMN "carrierEventAt" TIMESTAMP(3);
CREATE TABLE "OrderResolution" (
 "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL UNIQUE, "fingerprint" TEXT NOT NULL, "kind" TEXT NOT NULL CHECK ("kind" IN ('CANCEL','RETURN')),
 "state" TEXT NOT NULL CHECK ("state" IN ('REVIEW','WAITING_PAYMENT','WAITING_SHIPMENT','WAITING_RETURN','WAITING_BANK','READY','TRANSFER_RECORDED','DISPUTED','RECEIVED','REJECTED','CANCELLED_NO_REFUND')),
 "reason" TEXT NOT NULL, "policyReason" TEXT, "productsAmount" INTEGER NOT NULL DEFAULT 0 CHECK ("productsAmount">=0),
 "shippingAmount" INTEGER NOT NULL DEFAULT 0 CHECK ("shippingAmount">=0), "refundAmount" INTEGER NOT NULL DEFAULT 0 CHECK ("refundAmount">=0 AND "refundAmount"="productsAmount"+"shippingAmount"),
 "items" JSONB NOT NULL, "returnState" TEXT NOT NULL DEFAULT 'NONE' CHECK ("returnState" IN ('NONE','REQUIRED','IN_TRANSIT','RECEIVED','INSPECTED')),
 "returnTracking" TEXT, "bankCipher" TEXT, "bankDigest" TEXT, "stockRestored" BOOLEAN NOT NULL DEFAULT false,
 "revision" INTEGER NOT NULL DEFAULT 0, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "OrderResolution_one_open" ON "OrderResolution"("orderId") WHERE "state" NOT IN ('RECEIVED','REJECTED','CANCELLED_NO_REFUND');
CREATE INDEX "OrderResolution_orderId_createdAt_idx" ON "OrderResolution"("orderId","createdAt");
CREATE INDEX "OrderResolution_state_updatedAt_idx" ON "OrderResolution"("state","updatedAt");
CREATE TABLE "OrderResolutionEvent" ("id" TEXT PRIMARY KEY,"resolutionId" TEXT NOT NULL REFERENCES "OrderResolution"("id") ON DELETE RESTRICT,"action" TEXT NOT NULL,"actorId" TEXT NOT NULL,"note" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "OrderResolutionEvent_resolutionId_createdAt_idx" ON "OrderResolutionEvent"("resolutionId","createdAt");
CREATE TABLE "ResolutionTransfer" ("id" TEXT PRIMARY KEY,"resolutionId" TEXT NOT NULL UNIQUE REFERENCES "OrderResolution"("id") ON DELETE RESTRICT,"amount" INTEGER NOT NULL CHECK ("amount">0),"referenceDigest" TEXT NOT NULL UNIQUE,"reference" TEXT NOT NULL,"bankDigest" TEXT NOT NULL,"proofPath" TEXT NOT NULL,"proofMime" TEXT NOT NULL,"proofHash" TEXT NOT NULL,"settledAt" TIMESTAMP(3) NOT NULL,"recordedBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE "Shipment" ADD COLUMN "carrierCondition" TEXT NOT NULL DEFAULT 'NONE' CHECK ("carrierCondition" IN ('NONE','ISSUE','RETURNING','RETURNED'));
CREATE TABLE "ResolutionEvidence" ("id" TEXT PRIMARY KEY,"resolutionId" TEXT NOT NULL REFERENCES "OrderResolution"("id") ON DELETE RESTRICT,"proofPath" TEXT NOT NULL,"proofMime" TEXT NOT NULL,"proofHash" TEXT NOT NULL,"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "ResolutionEvidence_resolutionId_idx" ON "ResolutionEvidence"("resolutionId");
