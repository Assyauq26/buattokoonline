import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { handle, ok } from "@/lib/response";
import { readSettings, saveSettings } from "@/modules/payments/midtrans/settings";
import { jsonBody } from "@/modules/payments/midtrans/http";
export const dynamic = "force-dynamic";
export async function GET() { return handle(async () => { await requirePermission(PERMISSIONS.BANK_MANAGE);
  const response = ok(await readSettings()); response.headers.set("Cache-Control", "private, no-store"); return response; }); }
export async function POST(req: Request) { return handle(async () => { assertSameOrigin(req); const user = await requirePermission(PERMISSIONS.BANK_MANAGE);
  return ok(await saveSettings(user.id, await jsonBody(req))); }); }
