-- Review and apply through the approved migration process before deployment.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "SessionRevocation" (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "SessionRevocation_userId_idx" ON "SessionRevocation"("userId");
CREATE INDEX "SessionRevocation_expiresAt_idx" ON "SessionRevocation"("expiresAt");
CREATE TABLE "AuthRateLimit" (
  "bucket" TEXT NOT NULL PRIMARY KEY,
  "attempts" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AuthRateLimit_expiresAt_idx" ON "AuthRateLimit"("expiresAt");
ALTER TABLE "SessionRevocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthRateLimit" ENABLE ROW LEVEL SECURITY;
-- No public policies or grants: server role privileges must be reviewed separately.
