import "server-only";
import { tariffAreaPattern } from "./mapping-codes";
import { createHash } from "node:crypto";
import { z } from "zod";
import { HttpError } from "@/lib/response";
import { activeJntConfig, type JntConfig } from "./official-config";
import type { ShippingRate } from "../contracts/shipping-provider";
import { postPinnedJnt } from "./pinned-https";

export function officialJntSignature(payload: string, key: string): string {
  // PHP base64_encode(md5($payload . $key)): Base64 of the 32-character MD5 HEX string.
  const hex = createHash("md5").update(payload + key, "utf8").digest("hex");
  return Buffer.from(hex, "utf8").toString("base64");
}
async function postJnt(url: string, body: URLSearchParams | string, auth?: string): Promise<unknown> {
  const headers: Record<string, string> = auth ? { "Content-Type": "application/json", Authorization: auth } :
    { "Content-Type": "application/x-www-form-urlencoded" };
  const response = await postPinnedJnt(url, body.toString(), headers)
    .catch(() => { throw new HttpError("J&T tidak dapat dihubungi saat ini", 503); });
  if (!response.ok && !(auth && response.status === 404)) {
    await response.body?.cancel();
    if (auth && [401, 403].includes(response.status)) throw new HttpError("Autentikasi Tracking ditolak J&T", 502);
    throw new HttpError("J&T menolak permintaan", 502);
  }
  if (Number(response.headers.get("content-length") || 0) > 65536) {
    await response.body?.cancel();
    throw new HttpError("Respons J&T terlalu besar", 502);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError("Respons J&T kosong", 502);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) {
        await reader.cancel();
        throw new HttpError("Respons J&T terlalu besar", 502);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("Respons J&T tidak dapat dibaca", 502);
  } finally { reader.releaseLock(); }
  const responseText = Buffer.concat(chunks).toString("utf8");
  if (!responseText.trim()) throw new HttpError("Respons J&T kosong", 502);
  try { return JSON.parse(responseText); }
  catch { throw new HttpError("Respons J&T bukan JSON valid", 502); }
}
function signedForm(field: "data" | "data_param", payload: string, key: string) {
  return new URLSearchParams({
    [field]: payload,
    [field === "data" ? "sign" : "data_sign"]: officialJntSignature(payload, key),
  });
}
const rateResult = z.object({
  is_success: z.union([z.literal("true"), z.literal(true)]),
  content: z.string().max(65536),
}).passthrough();
const lineSchema = z.object({
  name: z.enum(["EZ", "HBO", "JND", "JSD", "ECO"]).optional(),
  productType: z.enum(["EZ", "HBO", "JND", "JSD", "ECO"]).optional(),
  cost: z.string().regex(/^\d{1,10}$/),
  currency: z.literal("IDR").optional(),
}).passthrough();
export interface JntRateRequest {
  originSite: string;
  destinationArea: string;
  weightGram: number;
  productType: "EZ" | "HBO" | "JND" | "JSD" | "ECO";
}
export async function checkJntRate(input: JntRateRequest, approvedConfig?: JntConfig): Promise<ShippingRate[]> {
  const cfg = approvedConfig ?? await activeJntConfig();
  if (!tariffAreaPattern.test(input.originSite) ||
      !tariffAreaPattern.test(input.destinationArea) ||
      !Number.isSafeInteger(input.weightGram) || input.weightGram <= 0 || input.weightGram > 100_000) {
    throw new HttpError("Rute atau berat J&T tidak valid", 422);
  }
  const weight = Math.ceil(input.weightGram / 10) / 100;
  const payload = JSON.stringify({
    cusName: cfg.credentials.tariffCustomer,
    sendSiteCode: input.originSite,
    destAreaCode: input.destinationArea,
    weight: String(weight),
    productType: input.productType,
  });
  const response = await postJnt(cfg.endpoints.tariff, signedForm("data", payload, cfg.credentials.tariffKey));
  const valid = rateResult.safeParse(response);
  if (!valid.success) throw new HttpError("J&T belum mengembalikan tarif yang valid", 502);
  let rates: unknown;
  try { rates = JSON.parse(valid.data.content); }
  catch { throw new HttpError("Data tarif J&T tidak valid", 502); }
  if (!Array.isArray(rates) || rates.length > 8) throw new HttpError("Daftar tarif J&T tidak valid", 502);
  const mapped = rates.map(item => {
    const parsed = lineSchema.safeParse(item);
    if (!parsed.success) throw new HttpError("Tarif J&T memiliki format tidak dikenal", 502);
    const service = parsed.data.productType || parsed.data.name;
    if (!service || (parsed.data.name && parsed.data.name !== service)) {
      throw new HttpError("Layanan J&T tidak cocok dengan permintaan", 502);
    }
    const cost = Number(parsed.data.cost);
    if (!Number.isSafeInteger(cost) || cost <= 0 || cost > 2_147_483_647) throw new HttpError("Nilai tarif J&T tidak valid", 502);
    return { courier: "J&T Express", service, cost, mode: "official" as const };
  });
  if (new Set(mapped.map(r => r.service)).size !== mapped.length) throw new HttpError("Tarif J&T duplikat", 502);
  return mapped;
}

const phone = z.string().regex(/^\+62\d{8,12}$/).max(15);
export const jntCreateOrderSchema = z.object({
  orderid: z.string().regex(/^[A-Z0-9-]{1,20}$/),
  shipper_name: z.string().min(1).max(30),
  shipper_contact: z.string().min(1).max(30),
  shipper_phone: phone,
  shipper_addr: z.string().min(4).max(200),
  origin_code: z.string().regex(/^[A-Z0-9]{3}$/),
  receiver_name: z.string().min(1).max(30),
  receiver_phone: phone,
  receiver_addr: z.string().min(4).max(200),
  receiver_zip: z.string().regex(/^\d{5}$/),
  destination_code: z.string().regex(/^[A-Z0-9]{3}$/),
  receiver_area: z.string().regex(/^[A-Z0-9]{1,10}$/),
  qty: z.number().int().min(1).max(100),
  weight: z.number().positive().max(100),
  goodsdesc: z.string().regex(/^[A-Za-z0-9 ]{1,40}$/),
  servicetype: z.union([z.literal(1), z.literal(6)]),
  insurance: z.number().int().min(0).max(99999999),
  orderdate: z.string().regex(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/),
  item_name: z.string().regex(/^[A-Za-z0-9 ]{1,50}$/),
  cod: z.number().int().min(0).max(99999999),
  sendstarttime: z.string().regex(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/),
  sendendtime: z.string().regex(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/),
  expresstype: z.enum(["1", "EZ", "HBO", "JSD", "JND"]),
  goodsvalue: z.number().int().min(0).max(99999999),
}).strict();
const createResult = z.object({
  success: z.literal(true),
  detail: z.array(z.object({
    orderid: z.string(),
    status: z.literal("Sukses"),
    awb_no: z.string().regex(/^[A-Z0-9]{8,30}$/),
  }).passthrough()).length(1),
}).passthrough();
/** Call only from a verified, durable paid-order workflow with an idempotency lock.
 * Not exposed as an admin test endpoint: each call may create a real AWB. */
export async function createJntOrder(value: z.input<typeof jntCreateOrderSchema>, approvedConfig?: JntConfig) {
  const input = jntCreateOrderSchema.parse(value);
  // Fulfillment preflights credentials before creating a durable carrier intent.
  // Passing that already-validated snapshot prevents a second deterministic
  // configuration failure after the intent has been committed.
  const cfg = approvedConfig ?? await activeJntConfig();
  const payload = JSON.stringify({ detail: [{ username: cfg.credentials.orderUsername, api_key: cfg.credentials.orderApiKey, ...input }] });
  const response = await postJnt(cfg.endpoints.order, signedForm("data_param", payload, cfg.credentials.orderKey));
  const result = createResult.safeParse(response);
  if (!result.success || result.data.detail[0].orderid !== input.orderid) {
    throw new HttpError("J&T tidak mengonfirmasi pembuatan resi; periksa status sebelum mencoba ulang", 502);
  }
  return { orderId: input.orderid, awb: result.data.detail[0].awb_no };
}
const cancelResult = z.object({
  success: z.literal(true),
  detail: z.array(z.object({ orderid: z.string(), status: z.literal("Sukses") }).passthrough()).length(1),
}).passthrough();
export async function cancelJntOrder(orderId: string, remark: string, approvedConfig?: JntConfig) {
  if (!/^[A-Z0-9-]{1,20}$/.test(orderId) || remark.length < 1 || remark.length > 30) {
    throw new HttpError("Data pembatalan J&T tidak valid", 422);
  }
  // An approved snapshot is obtained before recording an in-flight cancellation.
  const cfg = approvedConfig ?? await activeJntConfig();
  const credentials = cfg.credentials;
  const shared = cfg.sharedCancellation !== false;
  const username = shared ? credentials.orderUsername : credentials.cancellationUsername;
  const apiKey = shared ? credentials.orderApiKey : credentials.cancellationApiKey;
  const key = shared ? credentials.orderKey : credentials.cancellationKey;
  if (!username || !apiKey || !key) throw new HttpError("Kredensial Cancellation belum lengkap", 503);
  const payload = JSON.stringify({ detail: [{ username, api_key: apiKey, orderid: orderId, remark }] });
  const response = await postJnt(cfg.endpoints.cancellation, signedForm("data_param", payload, key));
  const result = cancelResult.safeParse(response);
  if (!result.success || result.data.detail[0].orderid !== orderId) {
    throw new HttpError("J&T belum mengonfirmasi pembatalan", 502);
  }
  return { orderId, cancelled: true };
}
export type JntTrackingEvent = {status:string;time:string|null;note:string|null;code?:string|null};
export async function trackJntOrder(awb: string, expectedOrderId?: string, approvedConfig?: JntConfig): Promise<{ awb: string; events: JntTrackingEvent[] }> {
  if (!/^[A-Z0-9]{8,30}$/.test(awb)) throw new HttpError("Nomor resi tidak valid", 422);
  const cfg = approvedConfig ?? await activeJntConfig();
  const auth = Buffer.from(cfg.credentials.trackingUsername + ":" + cfg.credentials.trackingPassword).toString("base64");
  const response = await postJnt(cfg.endpoints.tracking,
    JSON.stringify({ awb, eccompanyid: cfg.credentials.trackingUsername }), "Basic " + auth);
  const parsed = z.object({
    awb: z.string().optional(),
    orderid: z.string().optional(),
    error_id: z.union([z.string(), z.number()]).optional(),
    error_message: z.string().max(250).optional(),
    history: z.array(z.object({
      date_time: z.string().max(40).optional(),
      city_name: z.string().max(100).optional(),
      status: z.string().max(200).optional(),
      status_code: z.union([z.string(),z.number()]).optional(),
    }).passthrough()).max(200).optional(),
  }).passthrough().safeParse(response);
  if (parsed.success && String(parsed.data.error_id) === "404") {
    if (parsed.data.error_message === "Authorization failed") throw new HttpError("Autentikasi Tracking ditolak J&T", 502);
    if (parsed.data.error_message === "Invalid AWB number") throw new HttpError("Resi tidak ditemukan atau statusnya kedaluwarsa", 422);
  }
  if (!parsed.success || (parsed.data.error_id != null &&
      String(parsed.data.error_id) !== "0" && String(parsed.data.error_id) !== "") ||
      parsed.data.awb !== awb ||
      (expectedOrderId && parsed.data.orderid !== expectedOrderId)) {
    throw new HttpError("Tracking J&T belum tersedia atau AWB tidak cocok", 502);
  }
  // Deliberately excludes personal names, phone numbers, addresses, drivers and raw notes.
  return {awb, events:(parsed.data.history||[]).map(row=>({
    code:row.status_code == null ? null : String(row.status_code),
    status:row.status || (row.status_code != null ? String(row.status_code) : "Status tidak tersedia"),
    time:row.date_time || null,
    note:row.city_name || null,
  }))};
}

/** Only expose services selected by the owner and actually returned by J&T. */
export async function availableJntRates(input: Omit<JntRateRequest, "productType">, config: JntConfig) {
  const { selectedJntServices } = await import("./official-config");
  const selected = selectedJntServices(config);
  const outcomes = await Promise.allSettled(selected.map(productType => checkJntRate({ ...input, productType }, config)));
  const responses = outcomes.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  if (!responses.length) throw new HttpError("J&T belum mengembalikan layanan untuk alamat ini. Coba kembali atau hubungi toko.", 502);
  const byService = new Map<string, ShippingRate>();
  for (const rate of responses.flat()) {
    if (!selected.includes(rate.service as typeof selected[number])) continue;
    const previous = byService.get(rate.service);
    if (previous && previous.cost !== rate.cost) throw new HttpError("J&T mengembalikan tarif yang tidak konsisten. Coba kembali.", 502);
    byService.set(rate.service, rate);
  }
  return selected.flatMap(service => byService.has(service) ? [byService.get(service)!] : []);
}
