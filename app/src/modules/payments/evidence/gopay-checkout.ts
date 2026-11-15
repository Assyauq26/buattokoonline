import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { lockSource, storeScope } from "./repository";
import { assertBluOperator } from "./blu-access";
import { allocateAmount } from "./policy";
import { dynamicQris, validateStaticQris } from "./qris";
import { unseal } from "./secrets";
export const GOPAY_CHECKOUT_METHOD="gopay_merchant_qris";
export function goPayCheckoutEnabled(){return process.env.PAYMENT_GOPAY_CHECKOUT_ENABLED==="true" && process.env.PAYMENT_EVIDENCE_PREVIEW==="true";}
export async function replaceGoPayQris(actor:string,sourceId:string,payload:string|null){
  if(payload!==null)validateStaticQris(payload);
  return prisma.$transaction(async tx=>{
    await assertBluOperator(tx,actor);const s=await lockSource(tx,sourceId);
    if(s.kind!=="GOPAY_QRIS")throw new HttpError("Sumber bukan QRIS merchant",422);
    await tx.paymentEvidenceSource.update({where:{id:sourceId},data:{staticQris:payload,enabled:false,automationActorId:null,generation:{increment:1},leaseToken:null,leaseUntil:null}});
    await tx.paymentEvidenceReview.create({data:{sourceId,actorId:actor,action:payload?"GOPAY_QRIS_REPLACED":"GOPAY_QRIS_REMOVED",reason:"QRIS konfigurasi berubah; checkout perlu diaktifkan ulang. Snapshot tagihan lama tetap utuh."}});
    return {qrisSaved:!!payload};
  });
}
function boundMerchant(sourceId:string,encrypted:string){
  try {
    const session=JSON.parse(unseal(encrypted,storeScope(),sourceId,"gopay-session"));
    if(typeof session.merchantId!=="string" || typeof session.merchantName!=="string" || !session.access || !Number.isFinite(session.expiresAt))throw Error();
    return session as {merchantId:string;merchantName:string;expiresAt:number};
  }catch{throw new HttpError("Hubungkan akun GoPay dan verifikasi merchant terlebih dahulu",409);}
}
export async function setGoPayEnabled(actorId:string,sourceId:string,enabled:boolean,ownershipConfirmed:boolean){
  if(enabled && (!goPayCheckoutEnabled() || !ownershipConfirmed))throw new HttpError("Konfirmasi kepemilikan QRIS diperlukan dan layanan harus tersedia",409);
  return prisma.$transaction(async tx=>{
    await assertBluOperator(tx,actorId);const s=await lockSource(tx,sourceId);
    if(s.kind!=="GOPAY_QRIS")throw new HttpError("Sumber bukan QRIS GoPay",422);
    if(enabled){
      if(!s.encryptedSecret || !s.staticQris || s.health!=="MERCHANT_CONNECTED" || !s.lastCheckedAt || +s.lastCheckedAt<Date.now()-5*60000)throw new HttpError("Hubungkan akun, unggah QRIS dan periksa koneksi dalam lima menit terakhir",409);
      const merchant=boundMerchant(s.id,s.encryptedSecret);const qr=validateStaticQris(s.staticQris);
      if(merchant.merchantId!==s.accountRef || merchant.expiresAt<=Date.now())throw new HttpError("Identitas merchant atau sesi tidak sesuai",409);
      const qrName=qr.tags.find(t=>t.tag==="59")?.value.trim().replace(/\s+/g," ").toUpperCase();
      if(qrName!==merchant.merchantName.trim().replace(/\s+/g," ").toUpperCase())throw new HttpError("Nama QRIS tidak sama dengan merchant terhubung. Gunakan QRIS merchant ini.",409);
    }
    if(s.enabled===enabled && (!enabled || s.automationActorId===actorId))return {enabled};
    await tx.paymentEvidenceSource.update({where:{id:sourceId},data:{enabled,automationActorId:enabled?actorId:null,generation:{increment:1},leaseToken:null,leaseUntil:null,nextPollAt:null,cursor:null}});
    await tx.paymentEvidenceReview.create({data:{sourceId,actorId,action:enabled?"GOPAY_CHECKOUT_ENABLED":"GOPAY_CHECKOUT_DISABLED",reason:enabled?"Seller mengonfirmasi QRIS merchant sendiri; identitas akun dan nama QRIS sesuai.":"Checkout dihentikan; tagihan lama dan klaim tetap dipertahankan."}});
    return {enabled};
  });
}
export async function listGoPayCheckoutSources(){
  if(!goPayCheckoutEnabled())return [];
  return prisma.paymentEvidenceSource.findMany({where:{storeScope:storeScope(),kind:"GOPAY_QRIS",enabled:true,health:"MERCHANT_CONNECTED",encryptedSecret:{not:null},staticQris:{not:null},automationActorId:{not:null},lastCheckedAt:{gte:new Date(Date.now()-5*60000)}},select:{id:true,label:true,bankAccountId:true},take:30});
}
export async function prepareGoPayCheckout(tx:Prisma.TransactionClient,sourceId:string,base:number,consent:boolean,now=new Date()){
  if(!goPayCheckoutEnabled() || !consent)throw new HttpError("Konfirmasi nominal berkode unik QRIS diperlukan",422);
  const s=await lockSource(tx,sourceId);
  if(s.kind!=="GOPAY_QRIS" || !s.enabled || !s.encryptedSecret || !s.staticQris || !s.automationActorId || s.health!=="MERCHANT_CONNECTED" || !s.lastCheckedAt || +s.lastCheckedAt<+now-5*60000)throw new HttpError("QRIS GoPay belum siap. Tidak ada pengalihan otomatis ke metode lain.",409);
  await assertBluOperator(tx,s.automationActorId);const merchant=boundMerchant(s.id,s.encryptedSecret);
  if(merchant.merchantId!==s.accountRef || merchant.expiresAt<=+now)throw new HttpError("Sesi merchant perlu diperbarui",409);
  const occupied=await tx.paymentEvidenceAttempt.findMany({where:{sourceId,retainUntil:{gt:now}},select:{payable:true}});
  const amount=allocateAmount(base,new Set(occupied.map(a=>a.payable)));
  const expiresAt=new Date(+now+5*60000);
  return {...amount,sourceId,createdAt:now,expiresAt,retainUntil:new Date(+expiresAt+7*86400000),qrisPayload:dynamicQris(s.staticQris,amount.payable).payload,qrisId:randomUUID(),trxId:randomUUID(),merchantName:merchant.merchantName};
}
