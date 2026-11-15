import { handle, ok } from "@/lib/response";
import { jsonBody } from "@/modules/payments/midtrans/http";
import { webhook } from "@/modules/payments/midtrans/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(req: Request) { return handle(async () => { const response = ok(await webhook(await jsonBody(req, 32_000)));
  response.headers.set("Cache-Control", "no-store"); return response; }); }
