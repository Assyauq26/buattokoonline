import type { OrderStatus, PaymentStatus } from "@prisma/client";
export const customerTabs = [{key:"all",label:"Semua"},{key:"unpaid",label:"Belum bayar"},{key:"process",label:"Diproses"},{key:"shipped",label:"Dikirim"},{key:"done",label:"Selesai"}] as const;
export function customerOrderGroup(o:{status:OrderStatus;paymentStatus:PaymentStatus}) {
 if(o.status==="PENDING_PAYMENT") return o.paymentStatus==="WAITING_VERIFICATION" ? "process" : "unpaid";
 if(["PAID","PROCESSING","PACKED"].includes(o.status)) return "process";
 if(o.status==="SHIPPED") return "shipped";
 if(["DELIVERED","COMPLETED"].includes(o.status)) return "done";
 return "other";
}
