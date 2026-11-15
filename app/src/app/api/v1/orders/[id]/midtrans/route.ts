import { requireUser } from "@/lib/auth/session";
import { consumeAuthBucket } from "@/lib/auth/rate-limit";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { handle, ok, HttpError } from "@/lib/response";
import { createHash } from "node:crypto";
import { jsonBody } from "@/modules/payments/midtrans/http";
import { authorizeOrder, paymentView, openSnap, checkPayment } from "@/modules/payments/midtrans/service";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) { return handle(async () => {
  const user = await requireUser(), { id } = await params;
  await authorizeOrder(id, user.id, new URL(req.url).searchParams.get("staff") === "1");
  const response = ok(await paymentView(id)); response.headers.set("Cache-Control", "private, no-store"); return response;
}); }
export async function POST(req: Request, { params }: Context) { return handle(async () => {
  assertSameOrigin(req); const user = await requireUser(), { id } = await params;
  const input = await jsonBody(req, 1000);
  if (!["open", "check"].includes(String(input.action))) throw new HttpError("Aksi tidak valid", 422);
  const staff = input.staff === true;
  if (staff && input.action === "open") throw new HttpError("Pembayaran dibuka oleh pemilik pesanan", 403);
  const paymentId = await authorizeOrder(id, user.id, staff);
  const minute = Math.floor(Date.now() / 60_000);
  await consumeAuthBucket(`midtrans:${createHash("sha256").update(user.id).digest("hex")}:${minute}`, 3, new Date((minute + 1) * 60_000));
  const check = input.action === "check" ? await checkPayment(paymentId) : null;
  const response = ok(input.action === "open" ? await openSnap(paymentId) : { ...await paymentView(id), check });
  response.headers.set("Cache-Control", "private, no-store"); return response;
}); }
