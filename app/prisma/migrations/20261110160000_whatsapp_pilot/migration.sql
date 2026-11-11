-- Additive, opt-in pilot. No legacy phone is trusted or migrated to an identity.
CREATE TABLE "WhatsAppIdentity" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
 phone TEXT NOT NULL UNIQUE, "sessionVersion" INTEGER NOT NULL,
 "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',now()),
 "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',now())
);
CREATE TABLE "WhatsAppChallenge" (
 id TEXT PRIMARY KEY, "centralId" TEXT NOT NULL UNIQUE,
 "browserHash" TEXT NOT NULL, phone TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('login','link')),
 "userId" TEXT REFERENCES "User"(id) ON DELETE CASCADE,
 "sessionVersion" INTEGER, state TEXT NOT NULL DEFAULT 'pending'
 CHECK(state IN ('pending','exchanging','verified','consumed','failed')),
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',now())
);
CREATE INDEX "WhatsAppChallenge_expiresAt_idx" ON "WhatsAppChallenge"("expiresAt");
ALTER TABLE "WhatsAppIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppChallenge" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "WhatsAppPreference"(id INTEGER PRIMARY KEY CHECK(id=1),enabled BOOLEAN NOT NULL DEFAULT false,
 "desiredEnabled" BOOLEAN NOT NULL DEFAULT false,preparing BOOLEAN NOT NULL DEFAULT false,
 "changedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',now()),"syncedAt" TIMESTAMP(3));
INSERT INTO "WhatsAppPreference"(id) VALUES(1);
CREATE TABLE "WhatsAppWorkerLease"(id INTEGER PRIMARY KEY CHECK(id=1),token TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "WhatsAppConsentEvent"(revision BIGSERIAL PRIMARY KEY,"userId" TEXT NOT NULL,phone TEXT NOT NULL,granted BOOLEAN NOT NULL,"changedAt" TIMESTAMP(3) NOT NULL,state TEXT NOT NULL DEFAULT 'pending');
CREATE INDEX "WhatsAppConsentEvent_state_revision_idx" ON "WhatsAppConsentEvent"(state,revision);
CREATE TABLE "WhatsAppConsent"("userId" TEXT PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,phone TEXT NOT NULL,granted BOOLEAN NOT NULL DEFAULT false,"changedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',now()),"deliveredAt" TIMESTAMP(3));
-- Revocations survive phone changes and account deletion; no cascading FK here.
CREATE FUNCTION btos_whatsapp_consent_signal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  INSERT INTO "WhatsAppConsentEvent"("userId",phone,granted,"changedAt") VALUES(OLD."userId",OLD.phone,false,timezone('UTC',now()));
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.phone IS DISTINCT FROM NEW.phone THEN
  INSERT INTO "WhatsAppConsentEvent"("userId",phone,granted,"changedAt") VALUES(OLD."userId",OLD.phone,false,NEW."changedAt");
 END IF;
 INSERT INTO "WhatsAppConsentEvent"("userId",phone,granted,"changedAt") VALUES(NEW."userId",NEW.phone,NEW.granted,NEW."changedAt");
 RETURN NEW;
END $$;
CREATE TRIGGER btos_wa_consent_insert AFTER INSERT ON "WhatsAppConsent" FOR EACH ROW EXECUTE FUNCTION btos_whatsapp_consent_signal();
CREATE TRIGGER btos_wa_consent_change AFTER UPDATE OF phone,granted,"changedAt" ON "WhatsAppConsent" FOR EACH ROW EXECUTE FUNCTION btos_whatsapp_consent_signal();
CREATE TRIGGER btos_wa_consent_delete AFTER DELETE ON "WhatsAppConsent" FOR EACH ROW EXECUTE FUNCTION btos_whatsapp_consent_signal();
CREATE TABLE "WhatsAppOutbox"(
 revision BIGSERIAL PRIMARY KEY,"eventId" TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
 "orderId" TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',payload JSONB,
 attempts INTEGER NOT NULL DEFAULT 0,"nextAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',now()),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',now())
);
CREATE INDEX "WhatsAppOutbox_state_nextAt_idx" ON "WhatsAppOutbox"(state,"nextAt");
CREATE TABLE "WhatsAppOrderHead"("orderId" TEXT PRIMARY KEY,fingerprint TEXT NOT NULL);
ALTER TABLE "WhatsAppPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppWorkerLease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppConsentEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppConsent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppOutbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppOrderHead" ENABLE ROW LEVEL SECURITY;
-- Transactional signal only. No external request, user text or credentials in a
-- trigger. Worker reads the committed aggregate and coalesces intermediate steps.
CREATE FUNCTION btos_whatsapp_order_signal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target TEXT;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "WhatsAppPreference" WHERE id=1 AND enabled) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='Order' THEN target=NEW.id; ELSE target=NEW."orderId"; END IF;
 INSERT INTO "WhatsAppOutbox"("orderId") VALUES(target);
 RETURN NEW;
END $$;
CREATE TRIGGER btos_wa_order_insert AFTER INSERT ON "Order" FOR EACH ROW EXECUTE FUNCTION btos_whatsapp_order_signal();
CREATE TRIGGER btos_wa_order_change AFTER UPDATE OF status,"paymentStatus" ON "Order" FOR EACH ROW
 WHEN(OLD.status IS DISTINCT FROM NEW.status OR OLD."paymentStatus" IS DISTINCT FROM NEW."paymentStatus") EXECUTE FUNCTION btos_whatsapp_order_signal();
CREATE TRIGGER btos_wa_address AFTER INSERT OR UPDATE ON "OrderAddress" FOR EACH ROW EXECUTE FUNCTION btos_whatsapp_order_signal();
CREATE TRIGGER btos_wa_shipment AFTER INSERT OR UPDATE ON "Shipment" FOR EACH ROW EXECUTE FUNCTION btos_whatsapp_order_signal();
CREATE TRIGGER btos_wa_jnt AFTER INSERT OR UPDATE ON "JntShipmentRequest" FOR EACH ROW EXECUTE FUNCTION btos_whatsapp_order_signal();
CREATE TRIGGER btos_wa_resolution AFTER INSERT OR UPDATE ON "OrderResolution" FOR EACH ROW EXECUTE FUNCTION btos_whatsapp_order_signal();
CREATE FUNCTION btos_whatsapp_identity_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.phone IS DISTINCT FROM NEW.phone OR NOT NEW."isActive" OR NEW."deletedAt" IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM "WhatsAppIdentity" WHERE "userId"=NEW.id) THEN
   DELETE FROM "WhatsAppIdentity" WHERE "userId"=NEW.id;
   NEW."sessionVersion"=GREATEST(NEW."sessionVersion",OLD."sessionVersion"+1);
  END IF;
  UPDATE "WhatsAppConsent" SET granted=false,"changedAt"=timezone('UTC',now()),"deliveredAt"=NULL WHERE "userId"=NEW.id AND granted;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER btos_wa_identity_change BEFORE UPDATE OF phone,"isActive","deletedAt" ON "User" FOR EACH ROW EXECUTE FUNCTION btos_whatsapp_identity_change();
