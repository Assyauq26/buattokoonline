import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertExistingLocalStorageRoot } from "@/lib/self-hosted/storage-root";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const root = process.env.STORAGE_LOCAL_ROOT || "";
    assertExistingLocalStorageRoot(root);
    await access(root, constants.R_OK | constants.W_OK);
    return NextResponse.json({ success: true, data: { status: "ready" } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ success: false, data: { status: "unavailable" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
