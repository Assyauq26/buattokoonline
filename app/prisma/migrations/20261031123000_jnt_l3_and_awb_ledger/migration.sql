-- Additive J&T L3 official mapping and outbound request ledger. No legacy row is modified.
SET lock_timeout = '5s';
SET statement_timeout = '30s';
CREATE TABLE "JntL3Mapping" (
  "id" VARCHAR(96) NOT NULL,
  "version" VARCHAR(64) NOT NULL,
  "province" VARCHAR(130) NOT NULL,
  "city" VARCHAR(130) NOT NULL,
  "district" VARCHAR(130) NOT NULL,
  "jntProvince" VARCHAR(130) NOT NULL,
  "jntCity" VARCHAR(130) NOT NULL,
  "jntCityCode" VARCHAR(10) NOT NULL,
  "jntDistrict" VARCHAR(130) NOT NULL,
  "jntAreaCode" VARCHAR(10) NOT NULL,
  "emsifaDistrictCode" VARCHAR(12),
  "matchStatus" VARCHAR(16) NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  "approvedAt" TIMESTAMP(3),
  CONSTRAINT "JntL3Mapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JntL3Mapping_version_code_key" UNIQUE ("version","jntAreaCode"),
  CONSTRAINT "JntL3Mapping_status_check" CHECK ("matchStatus" IN ('EXACT','AMBIGUOUS','UNMATCHED'))
);
CREATE INDEX "JntL3Mapping_version_emsifaDistrictCode_approvedAt_idx"
  ON "JntL3Mapping" ("version","emsifaDistrictCode","approvedAt");
CREATE TABLE "JntMappingRelease" (
  "key" VARCHAR(16) NOT NULL DEFAULT 'primary',
  "activeVersion" VARCHAR(64) NOT NULL,
  "approvedBy" VARCHAR(128) NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JntMappingRelease_pkey" PRIMARY KEY ("key")
);
CREATE TABLE "JntShipmentRequest" (
  "orderId" TEXT NOT NULL,
  "externalOrderId" VARCHAR(20) NOT NULL,
  "payloadFingerprint" VARCHAR(64) NOT NULL,
  "state" VARCHAR(16) NOT NULL,
  "awb" VARCHAR(30),
  "requestedBy" VARCHAR(128) NOT NULL,
  "errorCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JntShipmentRequest_pkey" PRIMARY KEY ("orderId"),
  CONSTRAINT "JntShipmentRequest_externalOrderId_key" UNIQUE ("externalOrderId"),
  CONSTRAINT "JntShipmentRequest_state_check" CHECK ("state" IN ('PREPARED','DISPATCHED','UNKNOWN','SUCCEEDED','CANCELLED'))
);
ALTER TABLE "JntShipmentRequest" ADD CONSTRAINT "JntShipmentRequest_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
RESET lock_timeout;
RESET statement_timeout;
