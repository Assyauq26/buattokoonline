import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { handle, fail } from "@/lib/response";
import { GOPAY_CHECKOUT_METHOD } from "@/modules/payments/evidence/gopay-checkout";
import { consumeAuthBucket } from "@/lib/auth/rate-limit";
import { createHash } from "node:crypto";
export const dynamic="force-dynamic";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  return handle(async()=>{
    const user=await getCurrentUser(false);if(!user)return fail("Sesi wajib tersedia",401);
    const {id}=await params;if(!id || id.length>100)return fail("Pesanan tidak ditemukan",404);
    const p=await prisma.payment.findFirst({where:{order:{id,userId:user.id},method:GOPAY_CHECKOUT_METHOD},select:{evidenceAttempt:{select:{qrisId:true,qrisPayload:true}}}});
    if(!p?.evidenceAttempt?.qrisPayload || !p.evidenceAttempt.qrisId)return fail("QRIS tidak ditemukan",404);
    const minute=Math.floor(Date.now()/60000);
    await consumeAuthBucket(`qris-render:${createHash("sha256").update(user.id).digest("hex")}:${minute}`,30,new Date((minute+1)*60000));
    const bwip=await import("bwip-js/node");const png=await bwip.toBuffer({bcid:"qrcode",text:p.evidenceAttempt.qrisPayload,scale:6,padding:8,backgroundcolor:"FFFFFF"});
    return new Response(new Uint8Array(png),{headers:{"Content-Type":"image/png","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":`${new URL(req.url).searchParams.has("download")?"attachment":"inline"}; filename="qris-${p.evidenceAttempt.qrisId}.png"`}});
  });
}
