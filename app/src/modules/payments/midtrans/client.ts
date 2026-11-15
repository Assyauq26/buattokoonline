import "server-only";
import { HttpError } from "@/lib/response";
import { urls } from "./policy";

export type ProviderStatus = { order_id?: string; transaction_id?: string; merchant_id?: string;
  gross_amount?: string; currency?: string; transaction_status?: string; fraud_status?: string;
  payment_type?: string; status_code?: string };
export class MidtransRequestError extends Error {
  constructor(public readonly status: number, public readonly uncertain: boolean) { super("Permintaan Midtrans belum berhasil"); }
}
async function request(url: string, serverKey: string, body?: unknown): Promise<Record<string, unknown>> {
  let response: Response;
  try { response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
    headers: { Authorization: `Basic ${Buffer.from(serverKey + ":").toString("base64")}`, Accept: "application/json", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12_000) }); }
  catch { throw new MidtransRequestError(503, true); }
  if (!response.ok) { await response.body?.cancel(); throw new MidtransRequestError(response.status, response.status >= 500 || response.status === 409); }
  const reader = response.body?.getReader(); if (!reader) throw new MidtransRequestError(502, true);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length;
    if (size > 64_000) { await reader.cancel(); throw new MidtransRequestError(502, true); } chunks.push(value); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value;
  } catch { throw new MidtransRequestError(502, true); }
}
export async function statusRequest(environment: string, key: string, orderId: string): Promise<ProviderStatus | null> {
  try { const data = await request(`${urls(environment).api}/v2/${encodeURIComponent(orderId)}/status`, key);
    if (data.status_code === "404") return null;
    return data as ProviderStatus;
  } catch (error) { if (error instanceof MidtransRequestError && error.status === 404) return null; throw error; }
}
export async function snapRequest(environment: string, key: string, input: { orderId: string; amount: number; start: Date; expiresAt: Date; finish: string }) {
  const duration = Math.floor((input.expiresAt.getTime() - input.start.getTime()) / 60_000);
  if (duration < 5) throw new HttpError("Batas pembayaran terlalu dekat. Buat pesanan baru setelah pesanan ini ditutup.", 409);
  const start = input.start.toISOString().replace("T", " ").slice(0, 19) + " +0000";
  const data = await request(`${urls(environment).snap}/snap/v1/transactions`, key, {
    transaction_details: { order_id: input.orderId, gross_amount: input.amount },
    credit_card: { secure: true },
    expiry: { start_time: start, unit: "minutes", duration }, callbacks: { finish: input.finish },
  });
  if (typeof data.token !== "string" || data.token.length > 512 || typeof data.redirect_url !== "string") throw new MidtransRequestError(502, true);
  const redirect = new URL(data.redirect_url);
  if (redirect.origin !== urls(environment).snap || !redirect.pathname.startsWith("/snap/") || redirect.username || redirect.password) throw new MidtransRequestError(502, true);
  return { token: data.token, redirectUrl: redirect.toString() };
}
