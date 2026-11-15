import "server-only";
import { z } from "zod";
import { HttpError } from "@/lib/response";
import { boundedJson } from "./google";

/** Auditable adaptation of upstream 2f9444e, not execution of opaque login.js.
 * Endpoints are fixed; provider payloads/errors never reach browser/logs.
 * Historical DTOs are validated on every response, not presumed current. */
const AUTH = "https://api.gobiz.co.id";
const TRANSACTIONS = "https://api.gojekapi.com/merchant-analytics/v2/merchants/transactions";
const headers = { "Content-Type":"application/json", "Authentication-Type":"go-id", "X-User-Type":"merchant",
  Origin:"https://portal.gofoodmerchant.co.id", Referer:"https://portal.gofoodmerchant.co.id/",
  "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36" };
const secret = z.string().min(1).max(16000).regex(/^[\x21-\x3A\x3C-\x7E]+$/);
function merchantHeaders(access:string,refresh?:string){
  secret.parse(access);if(refresh)secret.parse(refresh);
  return {...headers,Authorization:"Bearer "+access,Cookie:`access_token=${access}; refresh_token=${refresh||""}; auth_method=goid`};
}
const challenge = z.object({ otp_token:secret });
const tokens = z.object({ access_token:secret, refresh_token:secret.optional(), expires_in:z.number().int().positive().max(86400).optional() });
function unwrap(value:unknown):unknown {
  if (value && typeof value === "object" && "data" in value) return (value as {data:unknown}).data;
  return value;
}
async function auth(path: "/goid/login/request"|"/goid/token",body:unknown,signal?:AbortSignal) {
  let response:Response;
  try { response = await fetch(AUTH+path,{ method:"POST",headers,body:JSON.stringify(body),cache:"no-store",redirect:"error",signal:AbortSignal.any([AbortSignal.timeout(10000),...(signal?[signal]:[])]) }); }
  catch { throw new HttpError("Layanan autentikasi GoPay tidak dapat dijangkau",503); }
  if(!response.ok) throw new HttpError(response.status===429 ? "Permintaan GoPay dibatasi. Tunggu sebelum mencoba lagi." : "GoPay menolak autentikasi. Kontrak layanan mungkin berubah atau kode sudah kedaluwarsa.",response.status===429?429:409);
  return unwrap(await boundedJson(response,128000));
}
export async function requestGoPayOtp(phone:string) {
  if(!/^\+?62\d{8,13}$/.test(phone)) throw new HttpError("Gunakan nomor merchant dengan kode negara 62",422);
  const result=challenge.safeParse(await auth("/goid/login/request",{phone_number:phone.replace(/^\+?62/,""),country_code:"62",client_id:"go-biz-web-new"}));
  if(!result.success) throw new HttpError("Kontrak challenge OTP GoPay tidak sesuai referensi. Koneksi belum dapat digunakan.",502);
  return result.data;
}
export async function verifyGoPayOtp(otp:string,otpToken:string) {
  if(!/^\d{4,8}$/.test(otp)) throw new HttpError("Kode OTP harus berisi 4–8 angka",422);
  const result=tokens.safeParse(await auth("/goid/token",{client_id:"go-biz-web-new",grant_type:"otp",data:{otp,otp_token:otpToken}}));
  if(!result.success) throw new HttpError("Respons sesi GoPay tidak sesuai kontrak; koneksi belum terverifikasi",502);
  return result.data;
}
/** Request shape observed in upstream c753b8c sessionManager under a networkless
 * synthetic trace: no live credential or network execution of the opaque module. */
export async function refreshGoPaySession(refresh:string,phone:string,signal?:AbortSignal) {
  if(!/^\+?62\d{8,13}$/.test(phone))throw new HttpError("Nomor sesi merchant tidak valid",422);
  const national=phone.replace(/^\+?62/,"");
  const result=tokens.safeParse(await auth("/goid/token",{client_id:"go-biz-web-new",grant_type:"refresh_token",data:{refresh_token:refresh,phone_number:national,country_code:"62"}},signal));
  if(!result.success)throw new HttpError("Kontrak refresh GoPay tidak sesuai. Hubungkan ulang akun.",409);
  return result.data;
}
/** Current upstream login reads response.merchant.id/outlet_name here. */
export async function readGoPayMerchant(access:string,signal?:AbortSignal,refresh?:string) {
  let response:Response;
  try {response=await fetch(AUTH+"/goresto/v5/public/users/config",{headers:merchantHeaders(access,refresh),cache:"no-store",redirect:"error",signal:AbortSignal.any([AbortSignal.timeout(10000),...(signal?[signal]:[])])});}
  catch {throw new HttpError("Konfigurasi merchant GoPay belum dapat dibaca",503);}
  if(!response.ok)throw new HttpError("GoPay menolak pemeriksaan akun merchant",response.status===401?401:503);
  const result=z.object({merchant:z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),outlet_name:z.string().min(1).max(200)})}).safeParse(await boundedJson(response));
  if(!result.success)throw new HttpError("Identitas merchant tidak tersedia atau kontrak konfigurasi berubah",502);
  return {id:result.data.merchant.id,name:result.data.merchant.outlet_name};
}
export async function readGoPayPage(access:string,merchant:string,start:Date,end:Date,offset=0,signal?:AbortSignal,refresh?:string) {
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(merchant) || !Number.isSafeInteger(offset) || offset<0 || offset>2147483597 ||
      !Number.isFinite(+start) || !Number.isFinite(+end) || start>=end || +end-+start>32*86400000)
    throw new HttpError("Filter mutasi GoPay tidak valid",422);
  const url=new URL(TRANSACTIONS);
  for(const [k,v] of Object.entries({from:String(offset),size:"50",statuses:"SETTLEMENT,CAPTURE,REFUND,PARTIAL_REFUND",payment_types:"QRIS,GOPAY",start_time:start.toISOString(),end_time:end.toISOString(),merchant_ids:merchant}))url.searchParams.set(k,v);
  let response:Response;
  try { response=await fetch(url,{headers:merchantHeaders(access,refresh),cache:"no-store",redirect:"error",signal:AbortSignal.any([AbortSignal.timeout(10000),...(signal?[signal]:[])])}); }
  catch { throw new HttpError("Mutasi GoPay sementara tidak tersedia",503); }
  if(response.status===401) throw new HttpError("Sesi GoPay perlu dipulihkan atau dihubungkan ulang",401);
  if(!response.ok) throw new HttpError("GoPay menolak pembacaan mutasi",503);
  const result=z.object({transactions:z.array(z.unknown()).max(50),total:z.number().int().nonnegative().optional()}).safeParse(unwrap(await boundedJson(response)));
  if(!result.success)throw new HttpError("Format mutasi GoPay berubah; pembayaran otomatis ditahan",502);
  return {...result.data,nextOffset:result.data.transactions.length===50?offset+50:null};
}
