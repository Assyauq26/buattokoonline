import { notFound } from "next/navigation";
import bwipjs from "bwip-js/node";
import { prisma } from "@/lib/prisma";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { historicJntConfig } from "@/modules/shipping/shipping-settings.service";
import { getVerifiedJntDistrict } from "@/infrastructure/shipping/jnt/verified-mapping";
import { AwbPrintButton } from "@/components/admin/awb-print-button";
import "./print.css";
export const dynamic="force-dynamic";
export default async function AwbPage({params}:{params:Promise<{id:string}>}){
  await requireBackofficeUser(PERMISSIONS.SHIPPING_READ);
  const {id}=await params;
  const order=await prisma.order.findUnique({where:{id},include:{address:true,shipment:true,jntShipmentRequest:true,items:true}});
  if(!order?.address||order.shipment?.provider!=="jnt"||order.jntShipmentRequest?.state!=="SUCCEEDED"||!order.shipment.trackingNumber||order.shipment.trackingNumber!==order.jntShipmentRequest.awb)notFound();
  const {config,mappingVersion}=await historicJntConfig(order.jntCheckoutRevisionId);
  const sender=config.seller!.warehouse;
  const mapping=await getVerifiedJntDistrict(order.address.districtCode!,mappingVersion);
  const awb=order.shipment.trackingNumber;
  const image=(bcid:string)=>"data:image/svg+xml;base64,"+Buffer.from(bwipjs.toSVG({bcid,text:awb,scale:3,...(bcid==="code128"?{height:16}:{}),includetext:false,paddingwidth:4,paddingheight:2})).toString("base64");
  const address=order.address;
  return <div className="awb-page"><div className="awb-toolbar"><AwbPrintButton/><p>Label 100 × 150 mm · Cetak pada skala 100%.</p></div><article className="awb-label">
    <header><div className="awb-brand"><strong>J&amp;T <small>EXPRESS</small></strong><span>jet.co.id</span></div><strong className="awb-service">{order.shippingService}</strong><img src={image("qrcode")} alt={`QR resi ${awb}`} className="awb-qr"/></header>
    <section className="awb-sender"><div><strong>Pengirim: </strong>{sender.name}</div><div>{sender.phone}</div><p>{sender.address}</p></section>
    <section className="awb-recipient"><div className="awb-line"><span><strong>Penerima: </strong>{address.recipientName}</span><span>{address.phone}</span></div><p>{[address.province,address.city,address.district].filter(Boolean).join(", ")}</p><strong className="awb-address">{[address.line,address.village,address.district,address.city,address.province].filter(Boolean).join(", ")}</strong></section>
    <div className="awb-facts"><span>Weight: {((order.shippingWeightGram||0)/1000).toFixed(3)} KG</span><span>Ship: {order.shipment.createdAt.toLocaleDateString("id-ID",{timeZone:"Asia/Jakarta"})}</span></div>
    <section className="awb-goods"><p>Jumlah: {order.items.reduce((n,i)=>n+i.quantity,0)} pcs · {order.items.map(i=>`${i.productName} (${i.quantity})`).join(", ")}</p><strong>NON COD</strong></section>
    <div className="awb-destination">{address.district}, {address.city}</div>
    <div className="awb-route">{mapping.destinationCityCode} · {mapping.receiverArea}</div>
    <div className="awb-barcode"><img src={image("code128")} alt={`Barcode resi ${awb}`}/><strong>{awb}</strong></div>
    <p className="awb-terms">Syarat dan ketentuan pengiriman: www.jet.co.id</p>
    <footer><strong>Order Id: {order.orderNumber}</strong><span>Estimated Date: —</span></footer>
  </article></div>;
}
