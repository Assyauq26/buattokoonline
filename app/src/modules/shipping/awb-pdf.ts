import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import bwipjs from "bwip-js/node";
import { readFile } from "node:fs/promises";
import path from "node:path";
export type AwbLabel = { awb:string; service:string; orderNumber:string; routingCode:string|null; senderName:string; senderPhone:string; senderAddress:string; recipientName:string; recipientPhone:string; address:string; destination:string; weight:number; date:string; items:{name:string;quantity:number}[]; codAmount?:number };
export function maskRecipientPhone(value:string){
 const digits=value.replace(/\D/g,""); const normalized=digits.startsWith("08")?"62"+digits.slice(1):digits;
 if(/^628\d{7,11}$/.test(normalized))return "+628"+"*".repeat(normalized.length-7)+normalized.slice(-4);
 return digits.length>4?"*".repeat(digits.length-4)+digits.slice(-4):"****";
}
const safe=(s:string)=>s.normalize("NFKD").replace(/[^\x20-\x7e\xa0-\xff]/g," ").replace(/\s+/g," ").trim();
export async function createAwbPdf(data:AwbLabel){
 const doc=await PDFDocument.create(); doc.setTitle("J&T AWB "+safe(data.awb));doc.setAuthor("Buat Toko Online Sendiri");
 const w=100*72/25.4,h=150*72/25.4,page=doc.addPage([w,h]);const regular=await doc.embedFont(StandardFonts.TimesRoman),bold=await doc.embedFont(StandardFonts.TimesRomanBold);
 const line=(y:number)=>page.drawLine({start:{x:8,y:h-y},end:{x:w-8,y:h-y},thickness:.7});
 const text=(s:string,x:number,y:number,size=9,heavy=false)=>page.drawText(safe(s),{x,y:h-y-size,font:heavy?bold:regular,size});
 function block(s:string,y:number,maxLines:number,size=10,heavy=false){
  const font=heavy?bold:regular,max=w-26;const lines:string[]=[];let current="";
  for(const word of safe(s).split(" ")){
   if(font.widthOfTextAtSize(word,size)>max){
    if(current){lines.push(current);current="";}
    for(const char of word){if(font.widthOfTextAtSize(current+char,size)>max){lines.push(current);current=char;}else current+=char;}
   }else if(font.widthOfTextAtSize(current+(current?" ":"")+word,size)>max){lines.push(current);current=word;}else current+=(current?" ":"")+word;
  }if(current)lines.push(current);
  if(lines.length>maxLines)throw new Error("Label terlalu panjang untuk dicetak aman. Ringkas nama/alamat barang sebelum mencetak.");
  lines.forEach((s,i)=>text(s,13,y+i*(size+2),size,heavy));
 }
 page.drawRectangle({x:8,y:8,width:w-16,height:h-16,borderColor:rgb(0,0,0),borderWidth:1});
 const logo=await doc.embedPng(await sharp(await readFile(path.join(process.cwd(),"public/carriers/jnt-express.png"))).modulate({brightness:0}).png().toBuffer());const logoSize=logo.scaleToFit(89,36);page.drawImage(logo,{x:13,y:h-43,width:logoSize.width,height:logoSize.height});
 const service=safe(data.service);const fs=Math.min(25,60/Math.max(bold.widthOfTextAtSize(service,1),1));text(service,(w-bold.widthOfTextAtSize(service,fs))/2,15,fs,true);
 const qr=await doc.embedPng(await bwipjs.toBuffer({bcid:"qrcode",text:data.awb,scale:5,padding:2}));page.drawImage(qr,{x:w-66,y:h-65,width:52,height:52});
 block("Pengirim: "+data.senderName+"  "+data.senderPhone,70,2,8);block(data.senderAddress,92,2,8);
 block("Penerima: "+data.recipientName+"  "+maskRecipientPhone(data.recipientPhone),116,2,9,true);block(data.address,142,5,10,true);line(207);
 text("Weight: "+(data.weight/1000).toFixed(3)+" KG",13,211,8);text("Ship: "+data.date,155,211,8);line(226);
 text(data.codAmount?"COD Rp "+data.codAmount:"NON COD",(w-bold.widthOfTextAtSize(data.codAmount?"COD Rp "+data.codAmount:"NON COD",22))/2,231,22,true);line(260);
 block(data.destination,265,1,10,true);if(data.routingCode)block(data.routingCode,281,1,17,true);
 const barcode=await doc.embedPng(await bwipjs.toBuffer({bcid:"code128",text:data.awb,scale:5,height:14,includetext:false,paddingwidth:12,paddingheight:2}));page.drawImage(barcode,{x:15,y:h-338,width:w-30,height:39});
 text(data.awb,(w-bold.widthOfTextAtSize(safe(data.awb),18))/2,340,18,true);line(364);
 block("Order ID: "+data.orderNumber,368,1,8,true);block("Jumlah: "+data.items.reduce((n,i)=>n+i.quantity,0)+" pcs | "+data.items.map(i=>i.name+" ("+i.quantity+")").join(", "),381,3,7);
 return doc.save();
}
