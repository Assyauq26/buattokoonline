import "server-only";
import { prisma } from "@/lib/prisma";
import { storeOrigin } from "@/lib/store-config";
import { registrationMailConfig } from "./registration-otp-email";
import { sanitizeMailBrand } from "./mail-contract.mjs";

export async function syncPendingMailBrand() {
  let config;
  try {
    config = registrationMailConfig();
  } catch {
    return;
  }
  if (config.mode !== "relay") return;
  const event = await prisma.storeMailBrandSync.findUnique({ where: { id: 1 } });
  if (!event || event.syncedAt || event.nextAttempt > new Date()) return;
  const attempts = event.attempts + 1;
  const nextAttempt = new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(attempts - 1, 7)) * 1000);
  const { count } = await prisma.storeMailBrandSync.updateMany({
    where: { id: 1, revision: event.revision, attempts: event.attempts, syncedAt: null },
    data: { attempts, nextAttempt },
  });
  if (!count) return;
  let status = "unavailable";
  try {
    const response = await fetch(config.endpoint + "/status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "sync-brand",
        origin: storeOrigin(),
        name: event.name,
        revision: event.revision,
      }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) {
      const result = await response.json();
      if (result.brand === sanitizeMailBrand(event.name)) status = "synced";
    } else {
      await response.body?.cancel();
      if ([401, 403, 409, 422].includes(response.status)) status = "action";
    }
  } catch {
    // The durable event is eligible for retry after nextAttempt.
  }
  await prisma.storeMailBrandSync.updateMany({
    where: { id: 1, revision: event.revision, attempts, syncedAt: null },
    data: { status, syncedAt: status === "synced" ? new Date() : null },
  });
}

export async function mailBrandSyncPending() {
  if (!process.env.STORE_MAIL_RELAY_TOKEN) return false;
  const event = await prisma.storeMailBrandSync.findUnique({
    where: { id: 1 },
    select: { syncedAt: true },
  });
  return Boolean(event && !event.syncedAt);
}
