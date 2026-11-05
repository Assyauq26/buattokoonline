import { z } from "zod";
import { handle, ok, HttpError } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { getCurrentUser } from "@/lib/auth/session";
import { isJntSettingsAdministrator, jntEnvironment } from "@/infrastructure/shipping/jnt/official-config";
import { readJntJson } from "@/infrastructure/shipping/jnt/request-body";
import { activateJntShipping, shippingSettingsStatus, setManualShipping } from "@/modules/shipping/shipping-settings.service";
import { manualShippingCost } from "@/modules/shipping/shipping-settings-input";

export const dynamic = "force-dynamic";
const choice = z.discriminatedUnion("method", [
  z.object({ method: z.literal("manual"), cost: manualShippingCost }).strict(),
  z.object({ method: z.literal("jnt"), environment: jntEnvironment }).strict(),
]);

export async function GET(req: Request) {
  return handle(async () => {
    await requireShippingAdmin();
    const environment = jntEnvironment.parse(new URL(req.url).searchParams.get("environment") ?? "sandbox");
    return privateShippingResponse(await shippingSettingsStatus(environment));
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireShippingAdmin();
    const input = choice.parse(await readJntJson(req, 1024));
    if (input.method === "manual") await setManualShipping(input.cost, actor.id);
    else await activateJntShipping(input.environment, actor.id);
    if (input.method === "manual") return privateShippingResponse({ manualFlat: input.cost, activeEnvironment: null });
    return privateShippingResponse(await shippingSettingsStatus(input.environment));
  });
}

async function requireShippingAdmin() {
  const user = await getCurrentUser(false);
  if (!user) throw new HttpError("Harap login", 401);
  if (!isJntSettingsAdministrator(user)) throw new HttpError("Akses pengaturan pengiriman ditolak", 403);
  return user;
}

function privateShippingResponse(data: unknown) {
  const response = ok(data);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
