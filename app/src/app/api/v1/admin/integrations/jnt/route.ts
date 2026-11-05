import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { getCurrentUser } from "@/lib/auth/session";
import { handle, HttpError } from "@/lib/response";
import { readJntJson } from "@/infrastructure/shipping/jnt/request-body";
import { localJntSettings } from "@/infrastructure/shipping/jnt/seller-config";
import {
  isJntSettingsAdministrator, jntEnvironment, jntSettingsInput,
  readJntPublicStatus, saveJntSettings,
} from "@/infrastructure/shipping/jnt/official-config";

export const dynamic = "force-dynamic";

async function owner() {
  const user = await getCurrentUser(false);
  if (!user) throw new HttpError("Harap login sebagai administrator integrasi", 401);
  if (!isJntSettingsAdministrator(user)) throw new HttpError("Anda tidak berwenang mengelola integrasi J&T", 403);
  return user;
}
function privateResponse(data: unknown) {
  const response = NextResponse.json({ success: true, data });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
export async function GET(req: Request) {
  return handle(async () => {
    await owner();
    const params = new URL(req.url).searchParams;
    if (localJntSettings() && Array.from(params.keys()).some(key => key !== "environment")) throw new HttpError("Parameter konfigurasi tidak valid", 422);
    const env = jntEnvironment.parse(params.get("environment") ?? "sandbox");
    return privateResponse(await readJntPublicStatus(env));
  });
}
export async function PUT(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await owner();
    if (Number(req.headers.get("content-length") || 0) > 16384) throw new HttpError("Konfigurasi terlalu besar", 413);
    const body = jntSettingsInput.safeParse(await readJntJson(req, 16384));
    if (!body.success) throw new HttpError("Konfigurasi J&T tidak valid; periksa field dan batas panjang", 422);
    const saved = await saveJntSettings(body.data, actor.id);
    return privateResponse(saved);
  });
}
