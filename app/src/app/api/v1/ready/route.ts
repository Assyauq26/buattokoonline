import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertExistingLocalStorageRoot } from "@/lib/self-hosted/storage-root";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { assertSessionRevocationAccess } from "@/lib/auth/session-state";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await assertSessionRevocationAccess();
    const [identity, control] = await Promise.all([
      prisma.storeAppearance.findUnique({ where: { key: "primary" }, select: { key: true } }),
      prisma.flashSaleControl.findUnique({ where: { key: "primary" }, select: { key: true } }),
    ]);
    if (!identity || !control) throw new Error("Store has not been initialized or database access is restricted");
    const root = process.env.STORAGE_LOCAL_ROOT || "";
    assertExistingLocalStorageRoot(root);
    await access(root, constants.R_OK | constants.W_OK);
    return NextResponse.json({ success: true, data: { status: "ready" } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ success: false, data: { status: "unavailable" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
