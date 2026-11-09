import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createAwbPdf, maskRecipientPhone } from "@/modules/shipping/awb-pdf";
import { customerOrderGroup } from "@/lib/customer-order-view";
describe("fixed AWB PDF",()=>{
 it("masks Indonesian and unknown phone formats",()=>{expect(maskRecipientPhone("081234567890")).toBe("+628******7890");expect(maskRecipientPhone("+6281234567890")).toBe("+628******7890");expect(maskRecipientPhone("123")).toBe("****");});
 it.each(["EZ","HBO","JND","JSD"])("generates a fixed label for %s",async service=>{const bytes=await createAwbPdf({awb:"JO1234567890",service,orderNumber:"ORD-TEST",routingCode:"410-1BGG06-12B",senderName:"Toko Demo",senderPhone:"081200000000",senderAddress:"Batang",recipientName:"Penerima Demo",recipientPhone:"081234567890",address:"Jalan Contoh, Warungasem, Batang, Jawa Tengah",destination:"WARUNGASEM",weight:450,date:"09/11/2026",items:[{name:"Mukena",quantity:1}]});const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(1);expect(pdf.getPage(0).getWidth()).toBeCloseTo(100*72/25.4);expect(pdf.getPage(0).getHeight()).toBeCloseTo(150*72/25.4);});
 it("rejects overflow instead of clipping operational data",async()=>{await expect(createAwbPdf({awb:"JO1234567890",service:"EZ",orderNumber:"ORD-TEST",routingCode:null,senderName:"Toko",senderPhone:"081200000000",senderAddress:"Batang",recipientName:"Penerima",recipientPhone:"081234567890",address:"Alamat sangat panjang ".repeat(100),destination:"Batang",weight:450,date:"09/11/2026",items:[]})).rejects.toThrow("terlalu panjang");});
});
describe("customer order grouping",()=>{it("keeps submitted proof out of unpaid actions",()=>{expect(customerOrderGroup({status:"PENDING_PAYMENT",paymentStatus:"WAITING_VERIFICATION"})).toBe("process");expect(customerOrderGroup({status:"PACKED",paymentStatus:"PAID"})).toBe("process");expect(customerOrderGroup({status:"CANCELLED",paymentStatus:"PAID"})).toBe("cancelled");});});
