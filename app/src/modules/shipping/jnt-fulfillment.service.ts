import "server-only";
import { jntDistrictCodePattern } from "@/infrastructure/shipping/jnt/mapping-codes";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertStaffPermission, lockOrder } from "@/modules/orders/transaction-locks";
import { assertNoActiveRefund } from "@/modules/payments/refund-state";
import { writeAudit } from "@/modules/audit/audit.service";
import { transitionOrderInTransaction } from "@/modules/orders/orders.service";
import { getVerifiedJntDistrict } from "@/infrastructure/shipping/jnt/verified-mapping";
import { createJntOrder, cancelJntOrder, trackJntOrder, jntCreateOrderSchema } from "@/infrastructure/shipping/jnt/official-transport";
import type { JntConfig } from "@/infrastructure/shipping/jnt/official-config";
import { historicJntConfig } from "./shipping-settings.service";
import type { Prisma } from "@prisma/client";

function requireFlag(name: string) {
  if (process.env[name] !== "yes") throw new HttpError("Operasi J&T belum diizinkan di server", 503);
}
function phoneNumber(value: string) {
  const numbers = value.replace(/\D/g, "");
  const normalized = numbers.startsWith("0") ? "+62" + numbers.slice(1) :
    numbers.startsWith("62") ? "+" + numbers : value;
  if (!/^\+62\d{8,12}$/.test(normalized) || normalized.length > 15) throw new HttpError("Nomor HP tidak valid untuk J&T", 422);
  return normalized;
}
function text(value: string, max: number) {
  const v = value.normalize("NFKD").replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!v || v.length > max) throw new HttpError("Identitas paket melebihi batas J&T", 422);
  return v;
}
function wib(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(value);
}
function warehouse(config: JntConfig) {
  const sender = config.seller!.warehouse;
  const name=sender.name, contact=sender.contact,
    address=sender.address, phone=sender.phone,
    code=sender.originCityCode;
  if (!name || !contact || !address || !phone || !/^[A-Z0-9]{3}$/.test(code)) {
    throw new HttpError("Data alamat gudang J&T belum lengkap di server", 503);
  }
  if(name.length>30 || contact.length>30 || address.length>200)throw new HttpError("Data gudang melewati batas J&T",422);
  return {shipper_name:name,shipper_contact:contact,shipper_addr:address,shipper_phone:phoneNumber(phone),origin_code:code};
}
const externalId=(orderId: string)=>"SO-"+createHash("sha256").update(orderId).digest("hex").slice(0,17).toUpperCase();
const payloadHash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
type Tx=Prisma.TransactionClient;

/** Reserve intent transactionally BEFORE contacting J&T. Never automatically retry UNKNOWN. */
export async function createJntAwb(orderId: string, actorId: string) {
  requireFlag("JNT_ENABLE_ORDER_CREATE");
  if(process.env.JNT_API_ENV==="production") {
    requireFlag("JNT_PRODUCTION_ORDER_APPROVED");
    requireFlag("JNT_PRODUCTION_API_APPROVED");
  }
  const prepared=await prisma.$transaction(async tx=>{
    await assertStaffPermission(tx,actorId,PERMISSIONS.SHIPPING_CREATE);
    await lockOrder(tx,orderId);
    const order=await tx.order.findUniqueOrThrow({
      where:{id:orderId},
      include:{address:true,payment:true,shipment:true,items:true,jntShipmentRequest:true},
    });
    const replacing = order.jntShipmentRequest?.state === "CANCELLED" && !!order.shipment?.cancelledAt;
    if(order.jntShipmentRequest && !replacing) {
      if(order.jntShipmentRequest.state==="SUCCEEDED"&&order.jntShipmentRequest.awb)
        return { existing:true as const, awb:order.jntShipmentRequest.awb };
      throw new HttpError("Request J&T sebelumnya belum direkonsiliasi; jangan buat resi ganda",409);
    }
    if(order.status!=="PACKED"||order.paymentStatus!=="PAID"||order.payment?.status!=="PAID"||
       order.shippingCourier!=="J&T Express"||order.shippingMode!=="official"||!["EZ","HBO","JND","JSD"].includes(order.shippingService || "")) {
      throw new HttpError("Resi resmi hanya untuk order J&T yang lunas, dikemas, dan bertarif resmi",409);
    }
    if(!order.address?.districtCode || !order.address.phone ||
       !order.address.recipientName)throw new HttpError("Alamat pesanan belum lengkap",422);
    if(order.shipment && !replacing)throw new HttpError("Shipment sudah ada; selesaikan rekonsiliasi terlebih dahulu",409);
    await assertNoActiveRefund(tx,order.payment.id);
    const { config, environment, mappingVersion } = await historicJntConfig(order.jntCheckoutRevisionId, tx);
    const sender = warehouse(config);
    const mapped = await getVerifiedJntDistrict(order.address.districtCode, mappingVersion, tx);
    if(!jntDistrictCodePattern.test(order.address.districtCode) && order.address.cityCode && !order.address.cityCode.startsWith(order.address.provinceCode||"??"))throw new HttpError("Hierarki alamat tidak valid",422);
    if(order.shippingWeightGram==null||order.shippingWeightGram<=0||order.shippingWeightGram>100_000)throw new HttpError("Berat pesanan tidak valid",422);
    const qty=order.items.reduce((sum,i)=>sum+i.quantity,0);
    if(qty<1||qty>100||order.subtotal<1||order.subtotal>99_999_999)throw new HttpError("Jumlah atau nilai paket di luar batas API J&T",422);
    if(order.address.postalCode && !/^\d{5}$/.test(order.address.postalCode))throw new HttpError("Kode pos tidak valid",422);
    const address=[order.address.line,order.address.village,order.address.district,order.address.city,order.address.province]
      .filter(Boolean).join(", ");
    // Required J&T transport fields are generated in WIB, not entered by staff.
    const requestTime=new Date();
    const pickupStart=new Date(+requestTime+5*60_000);
    const pickupEnd=new Date(+pickupStart+12*3600_000);
    const values={
      ...sender,orderid:externalId(replacing ? orderId + ":attempt:" + (await tx.jntShipmentAttempt.count({where:{orderId}}) + 2) : orderId),
      receiver_name:order.address.recipientName,receiver_phone:phoneNumber(order.address.phone),
      // J&T documents 00000 as the supported value when no postal code was supplied.
      // https://developer.jet.co.id/documentation (API BASIC ORDER, receiver_zip)
      receiver_addr:address,receiver_zip:order.address.postalCode || "00000",
      destination_code:mapped.destinationCityCode,receiver_area:mapped.receiverArea,
      qty,weight:Math.ceil(order.shippingWeightGram/10)/100,
      goodsdesc:"BARANG",servicetype:1 as const,insurance:0,
      orderdate:wib(requestTime),item_name:text(order.items[0].productName.slice(0,50),50),
      cod:0,sendstarttime:wib(pickupStart),sendendtime:wib(pickupEnd),
      expresstype:order.shippingService as "EZ" | "HBO" | "JND" | "JSD",goodsvalue:order.subtotal,
    };
    // Reject all deterministic request errors BEFORE reserving an external dispatch intent.
    if(!jntCreateOrderSchema.safeParse(values).success)throw new HttpError("Data penerima/paket tidak memenuhi format resmi Create Order J&T",422);
    // A unique DB row is the durable exactly-once *dispatch intent* (not exactly-once external effect).
    if (replacing) {
      const snapshot = await tx.shipment.findUniqueOrThrow({where:{orderId},include:{events:true,items:true}});
      await tx.jntShipmentAttempt.create({data:{orderId,externalOrderId:order.jntShipmentRequest!.externalOrderId,
        awb:order.jntShipmentRequest!.awb,requestSnapshot:JSON.parse(JSON.stringify(order.jntShipmentRequest)),
        shipmentSnapshot:JSON.parse(JSON.stringify(snapshot)),archivedBy:actorId}});
      await tx.shipment.delete({where:{orderId}});
      await tx.jntShipmentRequest.delete({where:{orderId}});
      await writeAudit({userId:actorId,action:"jnt.attempt.archived",entity:"Order",entityId:orderId,
        meta:{previousAwb:order.jntShipmentRequest!.awb,previousExternalId:order.jntShipmentRequest!.externalOrderId}},tx);
    }
    await tx.jntShipmentRequest.create({data:{
      orderId,externalOrderId:values.orderid,payloadFingerprint:payloadHash(values),
      state:"DISPATCHED",requestedBy:actorId,
    }});
    await writeAudit({userId:actorId,action:"jnt.order.dispatch",entity:"Order",entityId:orderId,
      meta:{externalOrderId:values.orderid,service:order.shippingService,mode:environment}},tx);
    return {existing:false as const,values,config};
  },{timeout:18000});
  if(prepared.existing)return {awb:prepared.awb,replayed:true};
  let result:Awaited<ReturnType<typeof createJntOrder>>;
  try {result=await createJntOrder(prepared.values, prepared.config);}
  catch {
    await prisma.jntShipmentRequest.updateMany({
      where:{orderId,state:"DISPATCHED"},data:{state:"UNKNOWN",errorCode:"UNCONFIRMED"},
    });
    throw new HttpError("Hasil Create Order J&T tidak pasti; jangan ulangi. Rekonsiliasi ke J&T menggunakan ID order eksternal",409);
  }
  try {
    await prisma.$transaction(async tx=>{
      await lockOrder(tx,orderId);
      const request=await tx.jntShipmentRequest.findUniqueOrThrow({where:{orderId}});
      if(request.state!=="DISPATCHED"||request.externalOrderId!==result.orderId)throw new HttpError("State pengiriman berubah; perlu rekonsiliasi",409);
      await tx.shipment.create({data:{
        orderId,provider:"jnt",courier:"J&T Express",service:prepared.values.expresstype,
        cost:(await tx.order.findUniqueOrThrow({where:{id:orderId},select:{shippingCost:true}})).shippingCost,
        trackingNumber:result.awb,status:"PENDING",notes:"AWB dibuat; belum bukti serah-terima",
      }});
      await tx.jntShipmentRequest.update({where:{orderId},data:{state:"SUCCEEDED",awb:result.awb,errorCode:null}});
      await writeAudit({userId:actorId,action:"jnt.order.accepted",entity:"Order",entityId:orderId,
        meta:{externalOrderId:result.orderId,awb:result.awb,routingCode:result.routingCode}},tx);
    },{timeout:18000});
  } catch {
    await prisma.jntShipmentRequest.updateMany({
      where:{orderId,state:"DISPATCHED"},data:{state:"UNKNOWN",errorCode:"PERSISTENCE_UNCERTAIN"},
    });
    throw new HttpError("J&T mungkin telah membuat AWB namun penyimpanan gagal; rekonsiliasi diperlukan, jangan coba ulang",409);
  }
  return {awb:result.awb,replayed:false};
}
export async function handoverJntPackage(orderId:string,actorId:string) {
  return prisma.$transaction(async tx=>{
    await assertStaffPermission(tx,actorId,PERMISSIONS.SHIPPING_UPDATE);
    await lockOrder(tx,orderId);
    const order=await tx.order.findUniqueOrThrow({where:{id:orderId},include:{shipment:true,jntShipmentRequest:true,payment:true}});
    if(order.status==="SHIPPED" && order.shipment?.status==="SHIPPED" && order.jntShipmentRequest?.state==="SUCCEEDED")return {ok:true,replayed:true};
    if(order.status!=="PACKED"||order.paymentStatus!=="PAID"||order.payment?.status!=="PAID"||
       order.shipment?.provider!=="jnt"||order.shipment?.status!=="PENDING"||
       !order.shipment.trackingNumber||order.jntShipmentRequest?.state!=="SUCCEEDED"||
       order.jntShipmentRequest.awb!==order.shipment.trackingNumber)throw new HttpError("Order belum layak diserahkan ke J&T",409);
    await assertNoActiveRefund(tx,order.payment.id);
    const now=new Date();
    await transitionOrderInTransaction(tx,orderId,"SHIPPED",actorId,"Diserahkan ke J&T", {source:"shipment"});
    await tx.shipment.update({where:{orderId},data:{status:"SHIPPED",shippedDate:now}});
    await tx.shipmentEvent.create({data:{shipmentId:order.shipment.id,status:"SHIPPED",description:"Serah-terima fisik dikonfirmasi operator",occurredAt:now}});
    await writeAudit({userId:actorId,action:"jnt.handover",entity:"Order",entityId:orderId,meta:{awb:order.shipment.trackingNumber}},tx);
    return {ok:true,replayed:false};
  },{timeout:18000});
}
/**
 * A carrier AWB is not proof of delivery. Only an authorized shipping operator
 * who has independently checked J&T's delivery proof may attest delivery.
 * Proof references are fingerprinted, not stored as free-form customer PII.
 */
export async function confirmJntDelivery(
  orderId: string, actorId: string,
  input: { evidenceReference: string; attested: boolean },
) {
  const reference = input.evidenceReference?.trim();
  if (input.attested !== true || !reference ||
      !/^[A-Za-z0-9][A-Za-z0-9:._/-]{7,119}$/.test(reference)) {
    throw new HttpError("Konfirmasi dan referensi bukti pengantaran J&T wajib valid", 422);
  }
  const proofHash = createHash("sha256").update(reference).digest("hex");
  return prisma.$transaction(async tx => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.SHIPPING_UPDATE);
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { shipment: true, jntShipmentRequest: true, payment: true },
    });
    const shipment = order.shipment;
    const request = order.jntShipmentRequest;
    if (order.shippingMode !== "official" || shipment?.provider !== "jnt" ||
        request?.state !== "SUCCEEDED" || !request.awb ||
        request.awb !== shipment.trackingNumber) {
      throw new HttpError("Resi resmi J&T belum terkonfirmasi", 409);
    }
    if (order.status === "DELIVERED" && shipment.status === "DELIVERED") {
      return { delivered: true, replayed: true };
    }
    if (order.status !== "SHIPPED" || !["SHIPPED", "IN_TRANSIT"].includes(shipment.status) ||
        order.paymentStatus !== "PAID" || order.payment?.status !== "PAID") {
      throw new HttpError("Pesanan belum dapat dikonfirmasi diterima", 409);
    }
    await assertNoActiveRefund(tx, order.payment.id);
    const now = new Date();
    await transitionOrderInTransaction(tx, orderId, "DELIVERED", actorId,
      "Bukti pengantaran J&T telah diverifikasi operator", { source: "shipment" });
    await tx.shipment.update({
      where: { orderId }, data: { status: "DELIVERED" },
    });
    await tx.shipmentEvent.create({
      data: { shipmentId: shipment.id, status: "DELIVERED",
        description: "Pengantaran J&T terverifikasi (referensi SHA256: " + proofHash.slice(0, 20) + ")",
        occurredAt: now },
    });
    await writeAudit({
      userId: actorId, action: "jnt.delivery.attested", entity: "Order", entityId: orderId,
      meta: { awb: request.awb, referenceHash: proofHash, attested: true },
    }, tx);
    return { delivered: true, replayed: false };
  }, { timeout: 18000 });
}
export async function getJntTracking(orderId:string,actorId:string) {
  await assertStaffPermission(prisma,actorId,PERMISSIONS.SHIPPING_READ);
  const order=await prisma.order.findUnique({where:{id:orderId},include:{shipment:true,jntShipmentRequest:true}});
  if(!order?.shipment||order.shipment.provider!=="jnt"||order.jntShipmentRequest?.state!=="SUCCEEDED"||
     !order.shipment.trackingNumber||order.shipment.trackingNumber!==order.jntShipmentRequest.awb)
    throw new HttpError("Resi J&T tidak tersedia untuk pesanan ini",404);
  const { syncJntTracking } = await import("./jnt-tracking.service");
  return syncJntTracking(orderId, false, actorId);
}
export async function cancelJntAwb(orderId:string,actorId:string) {
  requireFlag("JNT_ENABLE_CANCELLATION");
  if(process.env.JNT_API_ENV==="production")requireFlag("JNT_PRODUCTION_API_APPROVED");
  const request=await prisma.$transaction(async tx=>{
    await assertStaffPermission(tx,actorId,PERMISSIONS.SHIPPING_UPDATE);
    await lockOrder(tx,orderId);
    const order=await tx.order.findUniqueOrThrow({where:{id:orderId},include:{shipment:true,jntShipmentRequest:true,payment:true}});
    if(order.jntShipmentRequest?.state==="CANCELLED")return {existing:true as const};
    if(!["PACKED","PROCESSING"].includes(order.status)||order.shipment?.status!=="PENDING"||
       order.shipment?.provider!=="jnt"||!order.shipment.trackingNumber||
       order.jntShipmentRequest?.state!=="SUCCEEDED")throw new HttpError("J&T hanya dapat membatalkan AWB sebelum paket diproses",409);
    if(order.payment)await assertNoActiveRefund(tx,order.payment.id);
    const { config } = await historicJntConfig(order.jntCheckoutRevisionId, tx);
    await tx.jntShipmentRequest.update({where:{orderId},data:{state:"UNKNOWN",errorCode:"CANCELLATION_PENDING"}});
    await writeAudit({userId:actorId,action:"jnt.cancel.requested",entity:"Order",entityId:orderId,meta:{externalOrderId:order.jntShipmentRequest.externalOrderId}},tx);
    return {existing:false as const,externalOrderId:order.jntShipmentRequest.externalOrderId, config};
  });
  if(request.existing)return {cancelled:true,replayed:true};
  let cancelled=false;
  try {await cancelJntOrder(request.externalOrderId,"Cancelled by seller",request.config);cancelled=true;} catch {
    throw new HttpError("Status pembatalan J&T tidak pasti; jangan ulangi hingga rekonsiliasi",409);
  }
  if(cancelled){
    await prisma.$transaction(async tx=>{
      await lockOrder(tx,orderId);
      const current=await tx.jntShipmentRequest.findUniqueOrThrow({where:{orderId}});
      if(current.externalOrderId!==request.externalOrderId || current.state!=="UNKNOWN" || current.errorCode!=="CANCELLATION_PENDING")throw new HttpError("State pembatalan berubah; rekonsiliasi diperlukan",409);
      await tx.jntShipmentRequest.update({where:{orderId},data:{state:"CANCELLED",errorCode:null}});
      await tx.shipment.update({where:{orderId},data:{cancelledAt:new Date(),notes:"AWB dibatalkan J&T; proses finansial/order perlu ditangani terpisah"}});
      await writeAudit({userId:actorId,action:"jnt.cancel.success",entity:"Order",entityId:orderId,meta:{externalOrderId:request.externalOrderId}},tx);
    });
  }
  return {cancelled:true,replayed:false};
}

/** Explicit operator attestation after checking cancellation with the carrier; never dispatches an API order. */
export async function reconcileJntCancellation(orderId: string, actorId: string, input: { evidenceReference: string; attested: boolean }) {
  const reference = input.evidenceReference?.trim();
  if (input.attested !== true || !reference || !/^[A-Za-z0-9][A-Za-z0-9:._/-]{7,119}$/.test(reference)) throw new HttpError("Referensi konfirmasi pembatalan resmi dan persetujuan operator wajib diisi", 422);
  return prisma.$transaction(async tx => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.SHIPPING_UPDATE);
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { shipment: true, jntShipmentRequest: true } });
    const request = order.jntShipmentRequest;
    if (request?.state === "CANCELLED" && order.shipment?.cancelledAt) return { cancelled: true, replayed: true };
    if (request?.state !== "UNKNOWN" || request.errorCode !== "CANCELLATION_PENDING" ||
        Date.now() - request.updatedAt.getTime() < 300000 || order.shipment?.provider !== "jnt" ||
        order.shipment.status !== "PENDING" || !["PACKED", "PROCESSING"].includes(order.status))
      throw new HttpError("Rekonsiliasi hanya untuk pembatalan tidak pasti setelah 5 menit, sebelum serah-terima paket", 409);
    await tx.jntShipmentRequest.update({ where: { orderId }, data: { state: "CANCELLED", errorCode: null } });
    await tx.shipment.update({ where: { orderId }, data: { cancelledAt: new Date(), notes: "Pembatalan J&T dikonfirmasi operator berdasarkan bukti resmi. Pesanan dan pembayaran tidak dibatalkan." } });
    await writeAudit({ userId: actorId, action: "jnt.cancel.reconciled", entity: "Order", entityId: orderId,
      meta: { externalOrderId: request.externalOrderId, referenceHash: payloadHash(reference), attested: true } }, tx);
    return { cancelled: true, replayed: false };
  });
}
