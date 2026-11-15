import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertStaffPermission } from "@/modules/orders/transaction-locks";
import { consumeAuthBucket } from "@/lib/auth/rate-limit";
import { lockSource, requirePreview, storeScope,acquireSourceLease,finishSourceLease } from "./repository";
import { seal, unseal } from "./secrets";
import { requestGoPayOtp, verifyGoPayOtp, readGoPayMerchant, refreshGoPaySession } from "./gopay-client";
const sessionSchema = z.object({format:z.literal(1), phone:z.string().max(20), nonce:z.string().uuid(), actor:z.string(),
  challenge:z.string().max(16000).optional(), expiresAt:z.number(), attempts:z.number().int().nonnegative(),
  access:z.string().max(16000).optional(),refresh:z.string().max(16000).optional(),merchantId:z.string().optional(),merchantName:z.string().optional()}).strict();
type Session=z.infer<typeof sessionSchema>;
function encode(sourceId:string,data:Session){return seal(JSON.stringify(data),storeScope(),sourceId,"gopay-session");}
function decode(sourceId:string,encrypted:string){return sessionSchema.parse(JSON.parse(unseal(encrypted,storeScope(),sourceId,"gopay-session")));}
export function publicGoPayStatus(sourceId:string,encrypted:string|null){
  try{if(!encrypted)return null;const s=decode(sourceId,encrypted);return {merchantId:s.merchantId||null,merchantName:s.merchantName||null,phoneSuffix:s.phone.slice(-4),expiresAt:new Date(s.expiresAt).toISOString()};}
  catch{return null;}
}
export async function beginGoPayOtp(actor:string,sourceId:string,phone:string) {
  requirePreview();const now=Date.now(),nonce=randomUUID();
  if(!/^\+?62\d{8,13}$/.test(phone))throw new HttpError("Gunakan nomor merchant dengan kode negara 62",422);
  await prisma.$transaction(tx=>assertStaffPermission(tx,actor,PERMISSIONS.BANK_MANAGE));
  const minute=Math.floor(now/60000);
  await consumeAuthBucket(`gopay-otp:${storeScope()}:${minute}`,2,new Date((minute+1)*60000));
  const generation=await prisma.$transaction(async tx=>{
    await assertStaffPermission(tx,actor,PERMISSIONS.BANK_MANAGE);const s=await lockSource(tx,sourceId);
    if(s.kind!=="GOPAY_QRIS")throw new HttpError("Sumber bukan GoPay Merchant",422);
    if(s.encryptedSecret){const old=decode(sourceId,s.encryptedSecret);if(old.expiresAt>now && old.challenge)throw new HttpError("Selesaikan OTP aktif atau tunggu lima menit sebelum meminta ulang",429);}
    const updated=await tx.paymentEvidenceSource.update({where:{id:sourceId},data:{enabled:false,automationActorId:null,generation:{increment:1},health:"OTP_REQUESTING",leaseToken:null,leaseUntil:null,
      encryptedSecret:encode(sourceId,{format:1,phone,nonce,actor,expiresAt:now+5*60000,attempts:0})}});
    return updated.generation;
  });
  const challenge=await requestGoPayOtp(phone);
  await prisma.$transaction(async tx=>{
    await assertStaffPermission(tx,actor,PERMISSIONS.BANK_MANAGE);const s=await lockSource(tx,sourceId);
    if(s.generation!==generation || !s.encryptedSecret || decode(sourceId,s.encryptedSecret).nonce!==nonce)throw new HttpError("Koneksi berubah. OTP lama tidak dapat digunakan",409);
    await tx.paymentEvidenceSource.update({where:{id:sourceId},data:{health:"OTP_REQUIRED",encryptedSecret:encode(sourceId,{format:1,phone,nonce,actor,expiresAt:now+5*60000,attempts:0,challenge:challenge.otp_token})}});
    await tx.paymentEvidenceReview.create({data:{sourceId,actorId:actor,action:"GOPAY_OTP_REQUESTED",reason:"Permintaan OTP melalui adapter historis yang dapat diaudit; sesi belum terverifikasi."}});
  });return {otpRequired:true,expiresAt:new Date(now+5*60000).toISOString()};
}
export async function finishGoPayOtp(actor:string,sourceId:string,otp:string){
  requirePreview();
  const saved=await prisma.$transaction(async tx=>{
    await assertStaffPermission(tx,actor,PERMISSIONS.BANK_MANAGE);const s=await lockSource(tx,sourceId);
    if(s.kind!=="GOPAY_QRIS" || !s.encryptedSecret)throw new HttpError("Minta OTP terlebih dahulu",409);
    const v=decode(sourceId,s.encryptedSecret);
    if(v.actor!==actor || !v.challenge || v.expiresAt<=Date.now() || v.attempts>=5)throw new HttpError("OTP sudah berakhir atau batas percobaan tercapai. Minta kode baru setelah jeda.",409);
    v.attempts++;await tx.paymentEvidenceSource.update({where:{id:sourceId},data:{encryptedSecret:encode(sourceId,v)}});
    return {...v,generation:s.generation};
  });
  const result=await verifyGoPayOtp(otp,saved.challenge!);
  // Never infer an undocumented token lifetime. A provider response without
  // expiry needs further contract review before a persistent session is accepted.
  if(!result.expires_in)throw new HttpError("GoPay tidak mengembalikan masa berlaku sesi yang terverifikasi. Checkout tetap nonaktif.",502);
  const staged:Session={format:1,phone:saved.phone,nonce:randomUUID(),actor,attempts:0,access:result.access_token,refresh:result.refresh_token,expiresAt:Date.now()+result.expires_in*1000};
  await prisma.$transaction(async tx=>{
    await assertStaffPermission(tx,actor,PERMISSIONS.BANK_MANAGE);const s=await lockSource(tx,sourceId);
    if(s.generation!==saved.generation || !s.encryptedSecret || decode(sourceId,s.encryptedSecret).nonce!==saved.nonce)throw new HttpError("Koneksi berubah saat menerima sesi",409);
    await tx.paymentEvidenceSource.update({where:{id:sourceId},data:{health:"MERCHANT_CHECK_REQUIRED",encryptedSecret:encode(sourceId,staged)}});
  });
  const merchant=await readGoPayMerchant(result.access_token,undefined,result.refresh_token);
  await prisma.$transaction(async tx=>{
    await assertStaffPermission(tx,actor,PERMISSIONS.BANK_MANAGE);const s=await lockSource(tx,sourceId);
    if(s.generation!==saved.generation || !s.encryptedSecret || decode(sourceId,s.encryptedSecret).nonce!==staged.nonce)throw new HttpError("Koneksi berubah saat verifikasi",409);
    if(!s.accountRef.startsWith("pending-") && s.accountRef!==merchant.id)throw new HttpError("Merchant dari akun tidak sesuai konfigurasi. Jangan gunakan QRIS milik merchant lain.",409);
    await tx.paymentEvidenceSource.update({where:{id:sourceId},data:{health:"MERCHANT_CONNECTED",accountRef:merchant.id,lastCheckedAt:new Date(),encryptedSecret:encode(sourceId,{format:1,phone:saved.phone,nonce:randomUUID(),actor,attempts:0,access:result.access_token,refresh:result.refresh_token,merchantId:merchant.id,merchantName:merchant.name,expiresAt:Date.now()+result.expires_in!*1000})}});
    await tx.paymentEvidenceReview.create({data:{sourceId,actorId:actor,action:"GOPAY_OTP_ACCEPTED",reason:"Provider menerima OTP; identitas merchant dan kontrak refresh masih perlu diverifikasi sebelum aktivasi."}});
  });return {authenticated:true,merchantVerified:true,merchantName:merchant.name,checkoutEnabled:false};
}

/** Caller owns the durable source lease; generation fences disconnect/reconnect.
 * Refreshes are persisted before another provider call, survive a restart, and
 * are never exposed through a seller/customer response. */
export async function validGoPaySession(sourceId:string,generation:number,force=false,leaseToken?:string,signal?:AbortSignal){
  const s=await prisma.paymentEvidenceSource.findFirst({where:{id:sourceId,storeScope:storeScope(),kind:"GOPAY_QRIS",generation}});
  if(!s?.encryptedSecret)throw new HttpError("Hubungkan akun GoPay terlebih dahulu",409);
  if(!leaseToken || s.leaseToken!==leaseToken || !s.leaseUntil || s.leaseUntil<=new Date())throw new HttpError("Lease koneksi GoPay sudah berubah",409);
  let session=decode(sourceId,s.encryptedSecret);
  if(!session.access || !session.merchantId || session.merchantId!==s.accountRef)throw new HttpError("Sesi merchant belum terverifikasi",409);
  if(force || session.expiresAt<=Date.now()+60000){
    if(!session.refresh)throw new HttpError("GoPay meminta hubungkan ulang akun",401);
    try {
      const result=await refreshGoPaySession(session.refresh,session.phone,signal);
      if(!result.expires_in)throw new HttpError("Masa berlaku refresh tidak tersedia",401);
      // Persist rotated tokens before another network call. A temporary profile
      // outage must not discard the only usable refresh token after rotation.
      session={...session,access:result.access_token,refresh:result.refresh_token||session.refresh,expiresAt:Date.now()+result.expires_in*1000};
      const changed=await prisma.paymentEvidenceSource.updateMany({where:{id:sourceId,storeScope:storeScope(),generation,leaseToken,encryptedSecret:s.encryptedSecret},data:{encryptedSecret:encode(sourceId,session)}});
      if(changed.count!==1)throw new HttpError("Sesi berubah selama refresh",409);
      const merchant=await readGoPayMerchant(result.access_token,signal,session.refresh);
      if(merchant.id!==session.merchantId)throw new HttpError("Identitas merchant berubah",401);
      await prisma.paymentEvidenceReview.create({data:{sourceId,action:"GOPAY_SESSION_REFRESHED",reason:"Token diperbarui dan merchant tetap sama; kredensial tersimpan terenkripsi."}});
    } catch(error){
      if(error instanceof HttpError && error.status===503)throw error;
      await prisma.paymentEvidenceSource.updateMany({where:{id:sourceId,storeScope:storeScope(),generation},data:{enabled:false,health:"RECONNECT_REQUIRED"}});
      throw new HttpError("Sesi GoPay tidak dapat dipulihkan. Hubungkan ulang akun.",401);
    }
  }
  return session as Session & {access:string;merchantId:string};
}
export async function checkGoPayConnection(actor:string,sourceId:string){
  requirePreview();const source=await prisma.$transaction(async tx=>{
    await assertStaffPermission(tx,actor,PERMISSIONS.BANK_MANAGE);const s=await lockSource(tx,sourceId);
    if(s.kind!=="GOPAY_QRIS")throw new HttpError("Sumber bukan GoPay",422);return s;
  });
  const lease=await acquireSourceLease(sourceId,new Date(),source.generation);
  if(!lease)throw new HttpError("Pemeriksaan sedang berjalan atau cooldown satu menit belum selesai",409);
  try{
    const staged=source.encryptedSecret?decode(sourceId,source.encryptedSecret):null;
    if(staged?.access && !staged.merchantId && staged.expiresAt>Date.now()){
      const merchant=await readGoPayMerchant(staged.access,undefined,staged.refresh);
      await prisma.$transaction(async tx=>{
        await assertStaffPermission(tx,actor,PERMISSIONS.BANK_MANAGE);const current=await lockSource(tx,sourceId);
        if(current.generation!==lease.generation || current.leaseToken!==lease.token || !current.encryptedSecret || decode(sourceId,current.encryptedSecret).nonce!==staged.nonce)throw new HttpError("Koneksi berubah",409);
        if(!current.accountRef.startsWith("pending-") && current.accountRef!==merchant.id)throw new HttpError("Merchant tidak sesuai konfigurasi",409);
        await tx.paymentEvidenceSource.update({where:{id:sourceId},data:{accountRef:merchant.id,encryptedSecret:encode(sourceId,{...staged,merchantId:merchant.id,merchantName:merchant.name}),health:"MERCHANT_CONNECTED"}});
      });
    }
    const session=await validGoPaySession(sourceId,lease.generation,false,lease.token);
    const merchant=await readGoPayMerchant(session.access,undefined,session.refresh);
    if(merchant.id!==session.merchantId)throw new HttpError("Identitas merchant berubah",401);
    await finishSourceLease(sourceId,lease.token,lease.generation,{ok:true});
    return {connectionChecked:true,merchantName:merchant.name};
  }catch(error){try{await finishSourceLease(sourceId,lease.token,lease.generation,{ok:false,authFailed:error instanceof HttpError && error.status===401});}catch{/* Source was replaced. */}throw error;}
}
