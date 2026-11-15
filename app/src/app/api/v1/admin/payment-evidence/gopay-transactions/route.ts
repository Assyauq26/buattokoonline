import { requireEvidenceAdmin } from "@/modules/payments/evidence/access";
import { prisma } from "@/lib/prisma";
import { storeScope } from "@/modules/payments/evidence/repository";
import { handle,ok,fail } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
export const dynamic="force-dynamic";
export async function GET(req:Request){return handle(async()=>{
  const user=await requireEvidenceAdmin();if(!user.permissions.includes(PERMISSIONS.PAYMENT_READ))return fail("Akses pembayaran diperlukan",403);
  const url=new URL(req.url),id=url.searchParams.get("sourceId")||"",month=url.searchParams.get("month")||new Date(Date.now()+7*3600000).toISOString().slice(0,7),cursor=url.searchParams.get("cursor");
  const status=url.searchParams.get("status")||"";
  if(id.length>100 || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) || (cursor && cursor.length>100) || (status && !/^[A-Z_]{1,40}$/.test(status)))return fail("Filter tidak valid",422);
  const source=await prisma.paymentEvidenceSource.findFirst({where:{id,storeScope:storeScope(),kind:"GOPAY_QRIS"},select:{id:true,health:true,lastCheckedAt:true,cursor:true,enabled:true,accountRef:true}});
  if(!source)return fail("Merchant tidak ditemukan",404);
  const [year,m]=month.split("-").map(Number),start=new Date(Date.UTC(year,m-1,1)-7*3600000),end=new Date(Date.UTC(year,m,1)-7*3600000);
  if(cursor && !await prisma.incomingPaymentEvidence.findFirst({where:{id:cursor,sourceId:id},select:{id:true}}))return fail("Halaman tidak ditemukan",404);
  const rows=await prisma.incomingPaymentEvidence.findMany({where:{sourceId:id,occurredAt:{gte:start,lt:end},...(status?{providerStatus:status}:{})},orderBy:[{createdAt:"desc"},{id:"desc"}],...(cursor?{cursor:{id:cursor},skip:1}:{}),take:51,
    select:{id:true,amount:true,occurredAt:true,providerStatus:true,bankTxId:true,reason:true,claim:{select:{attempt:{select:{payment:{select:{order:{select:{id:true,orderNumber:true}}}}}}}}}});
  const logs=await prisma.paymentEvidenceReview.findMany({where:{sourceId:id,action:{startsWith:"GOPAY_"},NOT:{action:{in:["GOPAY_RECONCILE_CHECKPOINT"]}}},orderBy:[{createdAt:"desc"},{id:"desc"}],take:50,select:{id:true,action:true,createdAt:true}});
  const result=ok({source:{...source,cursor:undefined,backfillPending:!!source.cursor},transactions:rows.slice(0,50).map(row=>({...row,order:row.claim?.attempt.payment.order||null,claim:undefined})),nextCursor:rows.length>50?rows[49].id:null,logs,coverage:"Hanya mutasi yang telah berhasil dibaca backend; status pagination tidak membuktikan seluruh mutasi provider sudah terbaca."});
  result.headers.set("Cache-Control","private, no-store");return result;
});}
