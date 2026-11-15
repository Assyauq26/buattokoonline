import { requireEvidenceAdmin } from "@/modules/payments/evidence/access";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { handle, ok, fail } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { decodeQrisImage } from "@/modules/payments/evidence/qris-image";
import { consumeAuthBucket } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";
import { storeScope } from "@/modules/payments/evidence/repository";
export const dynamic = "force-dynamic";
export async function GET(req:Request){return handle(async()=>{
  const user=await requireEvidenceAdmin();if(!user.permissions.includes(PERMISSIONS.PAYMENT_READ))return fail("Akses pembayaran diperlukan",403);
  const id=new URL(req.url).searchParams.get("sourceId");if(!id || id.length>100)return fail("QRIS tidak ditemukan",404);
  const s=await prisma.paymentEvidenceSource.findFirst({where:{id,storeScope:storeScope(),kind:"GOPAY_QRIS"},select:{staticQris:true}});
  if(!s?.staticQris)return fail("QRIS tidak ditemukan",404);
  const bwip=await import("bwip-js/node");const png=await bwip.toBuffer({bcid:"qrcode",text:s.staticQris,scale:5,padding:8,backgroundcolor:"FFFFFF"});
  return new Response(new Uint8Array(png),{headers:{"Content-Type":"image/png","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
});}
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireEvidenceAdmin();
    if (!user.permissions.includes(PERMISSIONS.BANK_MANAGE)) return fail("Akses pengaturan rekening diperlukan",403);
    const minute = Math.floor(Date.now()/60_000);
    await consumeAuthBucket(`qris-image:${user.id}:${minute}`,5,new Date((minute+1)*60_000));
    const reader = req.body?.getReader(); if (!reader) return fail("Gambar wajib tersedia",422);
    const chunks: Uint8Array[]=[]; let size=0;
    while(true) { const {value,done}=await reader.read(); if(done)break; size+=value.length;
      if(size>4*1024*1024){await reader.cancel();return fail("Gambar maksimal 4 MB",413);}chunks.push(value); }
    return ok(await decodeQrisImage(Buffer.concat(chunks),req.headers.get("content-type")||""));
  });
}
