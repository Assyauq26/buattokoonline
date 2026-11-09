ALTER TABLE "Shipment" ADD COLUMN "cancelledAt" TIMESTAMP(3);
UPDATE "Shipment" s SET "cancelledAt" = r."updatedAt"
FROM "JntShipmentRequest" r WHERE s."orderId" = r."orderId" AND r."state" = 'CANCELLED' AND s."provider" = 'jnt';
CREATE TABLE "JntShipmentAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "externalOrderId" VARCHAR(20) NOT NULL UNIQUE,
  "awb" VARCHAR(30),
  "requestSnapshot" JSONB NOT NULL,
  "shipmentSnapshot" JSONB NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedBy" TEXT NOT NULL
);
CREATE INDEX "JntShipmentAttempt_orderId_archivedAt_idx" ON "JntShipmentAttempt"("orderId", "archivedAt");
