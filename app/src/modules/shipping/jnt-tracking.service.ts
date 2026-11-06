import "server-only";
import { prisma } from "@/lib/prisma";
import { lockOrder } from "@/modules/orders/transaction-locks";
import { assertNoActiveRefund } from "@/modules/payments/refund-state";
import { trackJntOrder } from "@/infrastructure/shipping/jnt/official-transport";
import { historicJntConfig } from "./shipping-settings.service";
import { trackingOutcome, trackingTime } from "./jnt-tracking-policy";
import { writeAudit } from "@/modules/audit/audit.service";
import { HttpError } from "@/lib/response";

export async function syncJntTracking(orderId:string,daily=false,actorId?:string) {
  return prisma.$transaction(async tx=>{
    await lockOrder(tx,orderId);
    const order=await tx.order.findUniqueOrThrow({where:{id:orderId},include:{shipment:true,jntShipmentRequest:true,payment:true}});
    const shipment=order.shipment,request=order.jntShipmentRequest;
    if(!shipment||shipment.provider!=="jnt"||!shipment.trackingNumber||request?.state!=="SUCCEEDED"||shipment.trackingNumber!==request.awb)throw new HttpError("Resi resmi tidak tersedia",409);
    if(daily&&(+shipment.updatedAt>Date.now()-86400000||!["PACKED","SHIPPED"].includes(order.status)))return {skipped:true,events:[]};
    let result;
    try {
      const {config}=await historicJntConfig(order.jntCheckoutRevisionId,tx);
      result=await trackJntOrder(shipment.trackingNumber,request.externalOrderId,config);
    } catch {
      await tx.shipment.update({where:{id:shipment.id},data:{updatedAt:new Date(),notes:"Tracking terakhir gagal; status paket dipertahankan. Akan dicoba kembali pada pemeriksaan berikutnya."}});
      return {failed:true,events:[]};
    }
    const outcome=trackingOutcome(result.events);
    for(const event of result.events) {
      const occurredAt=trackingTime(event.time); if(!occurredAt)continue;
      const description=[`J&T ${event.code ?? ""}`,event.status,event.note].filter(Boolean).join(" · ");
      if(!await tx.shipmentEvent.findFirst({where:{shipmentId:shipment.id,description,occurredAt},select:{id:true}}))await tx.shipmentEvent.create({data:{shipmentId:shipment.id,description,occurredAt,status:event.code==="200"?"DELIVERED":event.code==="100"?"IN_TRANSIT":shipment.status}});
    }
    let status=shipment.status;
    if(outcome&&["PACKED","SHIPPED"].includes(order.status)&&order.paymentStatus==="PAID"&&order.payment?.status==="PAID") {
      let canTransition=true;
      try { await assertNoActiveRefund(tx,order.payment.id); } catch(error) { if(error instanceof HttpError&&error.status===409)canTransition=false;else throw error; }
      if(canTransition) {
        let from=order.status;
        const targets: ("SHIPPED"|"DELIVERED")[] = [...(from==="PACKED"?["SHIPPED" as const]:[]),...(outcome==="DELIVERED"?["DELIVERED" as const]:[])];
        for(const to of targets){await tx.order.update({where:{id:orderId},data:{status:to}});await tx.orderStatusHistory.create({data:{orderId,fromStatus:from,toStatus:to,createdBy:actorId||"system",note:"Status diperbarui dari tracking resmi J&T"}});from=to;}
        status=outcome;
        if(targets.length)await writeAudit({userId:actorId||null,action:"jnt.tracking.transition",entity:"Order",entityId:orderId,meta:{from:order.status,to:from,awb:shipment.trackingNumber}},tx);
      }
    }
    await tx.shipment.update({where:{id:shipment.id},data:{status,updatedAt:new Date(),notes:"Tracking J&T berhasil diperbarui",...(status!=="PENDING"&&!shipment.shippedDate?{shippedDate:new Date()}: {})}});
    return {...result,failed:false};
  },{timeout:45000,maxWait:5000});
}
export async function syncDailyJntTracking() {
  const due=await prisma.shipment.findMany({where:{provider:"jnt",status:{in:["PENDING","SHIPPED","IN_TRANSIT"]},updatedAt:{lte:new Date(Date.now()-86400000)},order:{status:{in:["PACKED","SHIPPED"]},jntShipmentRequest:{state:"SUCCEEDED"}}},orderBy:{updatedAt:"asc"},take:1,select:{orderId:true}});
  let updated=0,failed=0;
  for(const row of due){try{const result=await syncJntTracking(row.orderId,true);if("failed" in result&&result.failed)failed++;else updated++;}catch{failed++;await prisma.shipment.updateMany({where:{orderId:row.orderId,updatedAt:{lte:new Date(Date.now()-86400000)}},data:{updatedAt:new Date(),notes:"Pemeriksaan tracking gagal; status paket dipertahankan."}});}}
  return {updated,failed,batch:due.length};
}
