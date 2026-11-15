import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { lockPaymentOrder } from "@/modules/orders/transaction-locks";
import { settlePaymentInTransaction } from "@/modules/payments/payment-settlement";
import { acquireSourceLease,finishSourceLease,ingestObservation,lockSource,storeScope } from "./repository";
import { assertBluOperator } from "./blu-access";
import { validGoPaySession } from "./gopay-session";
import { readGoPayPage } from "./gopay-client";
import { goPayCheckoutEnabled,GOPAY_CHECKOUT_METHOD } from "./gopay-checkout";
const mutation=z.object({id:z.string().min(1).max(200),merchant_id:z.string().optional(),
  gross_amount:z.union([z.number().int().positive(),z.string().regex(/^\d{1,10}(?:\.00)?$/)]),
  transaction_status:z.string().min(1).max(40),transaction_time:z.iso.datetime({offset:true}),
  currency:z.literal("IDR").optional(),payment_type:z.enum(["QRIS","GOPAY"]).optional()});
export function authenticatedGoPayObservation(raw:unknown,merchantId:string){
  const tx=mutation.parse(raw);const amount=Number(tx.gross_amount);
  if(!Number.isSafeInteger(amount) || amount<=0 || amount>2147483647 || (tx.merchant_id && tx.merchant_id!==merchantId))throw new Error("Mutasi merchant tidak sesuai");
  return {externalId:tx.id,bankTxId:tx.id,accountRef:merchantId,amount,currency:"IDR",direction:"CREDIT",status:tx.transaction_status.toUpperCase(),occurredAt:new Date(tx.transaction_time),trusted:true};
}
export async function reconcileGoPay(sourceId:string,actor:string,deadline=Date.now()+10000){
  const checkpoint=await prisma.paymentEvidenceReview.findFirst({where:{sourceId,source:{storeScope:storeScope()},action:"GOPAY_RECONCILE_CHECKPOINT"},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{reason:true}});
  let cursor:{createdAt:string;id:string}|null=null;
  try{cursor=JSON.parse(checkpoint?.reason||"null");if(cursor && (!Number.isFinite(+new Date(cursor.createdAt)) || typeof cursor.id!=="string" || cursor.id.length>100))cursor=null;}catch{cursor=null;}
  const attempts=await prisma.paymentEvidenceAttempt.findMany({where:{sourceId,source:{storeScope:storeScope(),kind:"GOPAY_QRIS",enabled:true,automationActorId:actor},claim:null,expiresAt:{gt:new Date()},payment:{method:GOPAY_CHECKOUT_METHOD,status:{in:["PENDING_PAYMENT","WAITING_VERIFICATION"]}},...(cursor?{OR:[{createdAt:{gt:new Date(cursor.createdAt)}},{createdAt:new Date(cursor.createdAt),id:{gt:cursor.id}}]}:{})},orderBy:[{createdAt:"asc"},{id:"asc"}],take:50});
  let settled=0;
  let last:typeof attempts[number]|null=null;
  for(const a of attempts){if(Date.now()>=deadline)break;
    await prisma.$transaction(async tx=>{
      await assertBluOperator(tx,actor);await lockPaymentOrder(tx,a.paymentId);const s=await lockSource(tx,sourceId);
      if(!s.enabled || s.automationActorId!==actor)return;
      const p=await tx.payment.findUniqueOrThrow({where:{id:a.paymentId},include:{order:{include:{items:true}}}});
      const now=new Date();if(p.method!==GOPAY_CHECKOUT_METHOD || p.order.status!=="PENDING_PAYMENT" || !p.order.expiresAt || p.order.expiresAt<=now || a.expiresAt<=now || p.amount!==a.payable || p.order.total!==a.payable || !["PENDING_PAYMENT","WAITING_VERIFICATION"].includes(p.status))return;
      const all=await tx.incomingPaymentEvidence.findMany({where:{sourceId,amount:a.payable,accountRef:s.accountRef,currency:"IDR",occurredAt:{gte:a.createdAt,lt:a.expiresAt,lte:new Date(+now+300000)}},take:21});
      // Include conflicting statuses/observations before selecting, so a known
      // refund or ambiguous duplicate cannot be hidden by a success-only filter.
      if(all.length!==1)return;const e=all[0];
      if(!e.trusted || !e.bankTxId || e.direction!=="CREDIT" || e.providerStatus!=="SETTLEMENT" || e.reason!=="SELLER_REVIEW_REQUIRED")return;
      if(await tx.paymentEvidenceClaim.findUnique({where:{evidenceId:e.id}}) || await tx.paymentEvidenceClaim.findUnique({where:{attemptId:a.id}}))return;
      if(await tx.paymentEvidenceAttempt.count({where:{sourceId,payable:a.payable,id:{not:a.id},createdAt:{lte:e.occurredAt!},expiresAt:{gt:e.occurredAt!}}}))return;
      await tx.paymentEvidenceClaim.create({data:{evidenceId:e.id,attemptId:a.id,actorId:actor,reason:"Mutasi merchant masuk SETTLEMENT, nominal tepat satu tagihan aktif; transaksi sumber diklaim permanen."}});
      if(p.status==="PENDING_PAYMENT")await tx.payment.update({where:{id:p.id},data:{status:"WAITING_VERIFICATION"}});
      await settlePaymentInTransaction(tx,{...p,status:"WAITING_VERIFICATION"},actor,"QRIS GoPay dikonfirmasi otomatis dari mutasi merchant");
      await tx.paymentEvidenceReview.create({data:{sourceId,evidenceId:e.id,attemptId:a.id,actorId:actor,action:"GOPAY_AUTO_SETTLED",reason:"Klaim transaksi sumber dan settlement berhasil atomik."}});settled++;
    });last=a;
  }
  if(last || (!attempts.length && cursor))await prisma.$transaction(async tx=>{
    await assertBluOperator(tx,actor);const s=await lockSource(tx,sourceId);if(!s.enabled || s.automationActorId!==actor)return;
    await tx.paymentEvidenceReview.create({data:{sourceId,action:"GOPAY_RECONCILE_CHECKPOINT",reason:JSON.stringify(last?{createdAt:last.createdAt.toISOString(),id:last.id}:null)}});
  });return {settled};
}
export async function runGoPayWorker(sourceId?:string,budgetMs=55000){
  if(!goPayCheckoutEnabled())return {read:0,settled:0,failed:0};
  const now=new Date(),deadline=Date.now()+budgetMs;
  const sources=await prisma.paymentEvidenceSource.findMany({where:{storeScope:storeScope(),kind:"GOPAY_QRIS",...(sourceId?{id:sourceId}:{}),enabled:true,automationActorId:{not:null},encryptedSecret:{not:null},OR:[{nextPollAt:null},{nextPollAt:{lte:now}}]},orderBy:{nextPollAt:"asc"},take:10});
  let read=0,settled=0,failed=0;
  for(const s of sources){if(Date.now()>deadline-10000)break;
    await prisma.$transaction(tx=>assertBluOperator(tx,s.automationActorId!));
    const lease=await acquireSourceLease(s.id,new Date(),s.generation);if(!lease)continue;
    try{
      let session=await validGoPaySession(s.id,lease.generation,false,lease.token);
      let cursor:{start:string;end:string;offset:number};
      try{cursor=JSON.parse(lease.cursor||"null");if(!cursor || !Number.isSafeInteger(cursor.offset) || cursor.offset<0 || !Number.isFinite(+new Date(cursor.start)) || !Number.isFinite(+new Date(cursor.end)))throw Error();}
      catch{cursor={start:new Date(+now-15*60000).toISOString(),end:now.toISOString(),offset:0};}
      let next:string|undefined=lease.cursor||undefined;
      for(let page=0;page<5 && Date.now()<deadline-5000;page++){
        let result;
        try{result=await readGoPayPage(session.access,session.merchantId,new Date(cursor.start),new Date(cursor.end),cursor.offset);}
        catch(error){if(!(error instanceof HttpError) || error.status!==401)throw error;session=await validGoPaySession(s.id,lease.generation,true,lease.token);result=await readGoPayPage(session.access,session.merchantId,new Date(cursor.start),new Date(cursor.end),cursor.offset);}
        for(const raw of result.transactions){
          let observation;
          try{observation=authenticatedGoPayObservation(raw,session.merchantId);}catch{
            const fingerprint=createHash("sha256").update(JSON.stringify(raw)).digest("hex");
            if(!await prisma.paymentEvidenceReview.findFirst({where:{sourceId:s.id,action:"GOPAY_UNSUPPORTED_MUTATION",reason:fingerprint},select:{id:true}}))
              await prisma.paymentEvidenceReview.create({data:{sourceId:s.id,action:"GOPAY_UNSUPPORTED_MUTATION",reason:fingerprint}});
            continue;
          }
          await ingestObservation(s.id,lease.generation,lease.token,observation);read++;
        }
        if(result.nextOffset===null){next="";break;}
        cursor.offset=result.nextOffset;next=JSON.stringify(cursor);
      }
      // Prioritize the live payment window. Month history has its own durable
      // cursor and consumes at most one extra page after the live scan completes.
      if(next==="" && Date.now()<deadline-15000){
        const wib=new Date(+now+7*3600000),monthStart=new Date(Date.UTC(wib.getUTCFullYear(),wib.getUTCMonth(),1)-7*3600000);
        const old=await prisma.paymentEvidenceReview.findFirst({where:{sourceId:s.id,action:"GOPAY_HISTORY_CURSOR"},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{reason:true}});
        let history:{start:string;end:string;offset:number};
        try{history=JSON.parse(old?.reason||"null");if(!history || !Number.isSafeInteger(history.offset) || history.offset<0 || !Number.isFinite(+new Date(history.start)) || !Number.isFinite(+new Date(history.end)))throw Error();
          if(new Date(history.end)<monthStart)throw Error();}
        catch{history={start:monthStart.toISOString(),end:now.toISOString(),offset:0};}
        const page=await readGoPayPage(session.access,session.merchantId,new Date(history.start),new Date(history.end),history.offset);
        for(const raw of page.transactions){
          try{const observation=authenticatedGoPayObservation(raw,session.merchantId);await ingestObservation(s.id,lease.generation,lease.token,observation);read++;}
          catch(error){if(error instanceof HttpError)throw error;/* Unsupported row cannot authorize settlement. */}
        }
        const checkpoint=page.nextOffset===null?{start:new Date(+new Date(history.end)-60000).toISOString(),end:now.toISOString(),offset:0}:{...history,offset:page.nextOffset};
        if(new Date(checkpoint.start)>=new Date(checkpoint.end))checkpoint.end=new Date(+new Date(checkpoint.start)+1000).toISOString();
        await prisma.$transaction(async tx=>{const current=await lockSource(tx,s.id);if(current.generation!==lease.generation || current.leaseToken!==lease.token)throw new HttpError("Koneksi berubah",409);
          await tx.paymentEvidenceReview.create({data:{sourceId:s.id,action:"GOPAY_HISTORY_CURSOR",reason:JSON.stringify(checkpoint)}});});
      }
      await finishSourceLease(s.id,lease.token,lease.generation,{ok:true,cursor:next});
      settled+=(await reconcileGoPay(s.id,s.automationActorId!,deadline)).settled;
    }catch(error){failed++;try{await finishSourceLease(s.id,lease.token,lease.generation,{ok:false,authFailed:error instanceof HttpError && error.status===401});}catch{/* New generation owns state. */}}
  }return {read,settled,failed};
}
