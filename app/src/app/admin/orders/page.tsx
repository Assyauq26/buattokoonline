import "./orders.css";
import { Package, UserRound, PackageCheck, SlidersHorizontal } from "lucide-react";
import { FilterForm } from "@/components/ui/filter-form";
import { Suspense } from "react";
import { OperationsSkeleton } from "@/components/admin/operations-skeleton";
import Link from "@/components/ui/navigation";
import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { pageNumber } from "@/modules/inventory/inventory.validation";
import { formatIDR } from "@/lib/money";
import { ORDER_STATUS_LABEL, orderDisplayStatus, paymentDisplayStatus } from "@/lib/order-status";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLinks } from "@/components/admin/operations-layout";
import { readPage } from "@/lib/pagination";
export const dynamic = "force-dynamic";
export default async function AdminOrdersPage(props: { searchParams: Promise<{ q?: string; status?: string; tab?: string; page?: string }> }) {
  await requireBackofficeUser(PERMISSIONS.ORDER_READ);
  return <Suspense fallback={<OperationsSkeleton />}><AdminOrdersPageContent {...props} /></Suspense>;
}
async function AdminOrdersPageContent({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; tab?: string; page?: string }> }) {
  const params = await searchParams;
  const q = (params.q || "").slice(0, 200); const status = Object.values(OrderStatus).includes(params.status as OrderStatus) ? params.status as OrderStatus : undefined;
  const tabs: {key:string;label:string;where:Prisma.OrderWhereInput}[] = [
    {key:"all",label:"Semua",where:{}},
    {key:"verify",label:"Verifikasi Pembayaran",where:{status:"PENDING_PAYMENT",paymentStatus:"WAITING_VERIFICATION"}},
    {key:"process",label:"Perlu Diproses",where:{status:{in:["PAID","PROCESSING"]}}},
    {key:"ready",label:"Siap Dikirim",where:{status:"PACKED"}},
    {key:"shipped",label:"Dikirim",where:{status:"SHIPPED"}},
    {key:"done",label:"Selesai",where:{status:{in:["DELIVERED","COMPLETED"]}}},
  ];
  const tab=tabs.find(t=>t.key===params.tab) ?? tabs[0];
  const search:Prisma.OrderWhereInput=q?{OR:[{orderNumber:{contains:q,mode:"insensitive"}},{address:{recipientName:{contains:q,mode:"insensitive"}}}]}:{};
  const where:Prisma.OrderWhereInput={AND:[tab.where,search,...(status?[{status}]:[])]};
  const counts=await Promise.all(tabs.map(t=>prisma.order.count({where:{AND:[t.where,search]}})));
  const { rows, total, pages, page } = await readPage(pageNumber(params.page),
    () => prisma.order.count({ where }),
    (skip, take) => prisma.order.findMany({ where, select: { id: true, orderNumber: true, createdAt: true, status: true, paymentStatus: true, total: true, shippingCourier:true, shippingService:true, items:{take:1,orderBy:{id:"asc"},select:{productName:true,variantLabel:true,quantity:true,imageUrl:true}}, address:{select:{recipientName:true}}, user: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, skip }));
  return <div className="orders-page"><header><h1>Pesanan</h1><p>Kelola pesanan toko Anda.</p></header>
    <nav className="orders-tabs" aria-label="Status pesanan">{tabs.map((t,i)=><Link key={t.key} href={`/admin/orders?tab=${t.key}&q=${encodeURIComponent(q)}`} aria-current={tab.key===t.key?"page":undefined}>{t.label} ({counts[i]})</Link>)}</nav>
    <FilterForm action="/admin/orders" key={JSON.stringify(params)} role="search" className="orders-search"><input type="hidden" name="tab" value={tab.key}/><label><span className="sr-only">Cari pesanan atau penerima</span><Input name="q" defaultValue={q} placeholder="Cari pesanan..." maxLength={200}/></label><details><summary aria-label="Filter pesanan"><SlidersHorizontal size={22}/></summary><div><select name="status" defaultValue={status||""} aria-label="Status pesanan"><option value="">Semua status</option>{Object.values(OrderStatus).map(s=><option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}</select><Button>Terapkan</Button><Link href="/admin/orders">Reset</Link></div></details><button type="submit" className="sr-only">Cari</button></FilterForm>
    {!rows.length?<EmptyState title="Tidak ada pesanan yang sesuai" description="Ubah pencarian atau filter pesanan."/>:<ul className="orders-cards">{rows.map(o=>{const item=o.items[0];return <li key={o.id} data-testid={`admin-order-${o.orderNumber}`}><Link href={`/admin/orders/${o.id}`} className="order-card"><div className="order-thumb">{item?.imageUrl?<img src={item.imageUrl} alt={item.productName}/>:<Package size={30}/>}</div><div className="order-card-info"><div className="order-card-meta"><strong>{o.orderNumber}</strong><span>{o.createdAt.toLocaleString("id-ID",{timeZone:"Asia/Jakarta",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span></div><h2>{item?.productName||"Produk pesanan"}</h2><p>{item?.variantLabel} × {item?.quantity}{o._count.items>1?` · +${o._count.items-1} produk`:""}</p><p className="order-buyer"><UserRound size={16}/>{o.address?.recipientName||o.user.name}</p></div><strong className="order-card-total">{formatIDR(o.total)}</strong><div className="order-card-status"><span className="order-status-pill">{o.status==="PAID"?"Perlu diproses":orderDisplayStatus(o.status,o.paymentStatus)}</span><span>{o.paymentStatus==="PAID"?"✓ Dibayar":paymentDisplayStatus(o.paymentStatus)}</span><span>{o.shippingCourier} · {o.shippingService}</span></div><span className="order-card-action"><PackageCheck size={22}/>{o.paymentStatus==="WAITING_VERIFICATION"?"Verifikasi":["PAID","PROCESSING","PACKED"].includes(o.status)?"Proses":"Detail"}</span></Link></li>})}</ul>}
    <p className="orders-count">{total} pesanan ditemukan</p><PageLinks path="/admin/orders" params={{q,status,tab:tab.key}} page={page} pages={pages}/>
  </div>;
}
