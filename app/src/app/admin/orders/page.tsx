import { OrderFilters } from "@/components/admin/order-filters";
import "./orders.css";
import { Package, UserRound } from "lucide-react";
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
import { orderDisplayStatus } from "@/lib/order-status";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLinks } from "@/components/admin/operations-layout";
import { readPage } from "@/lib/pagination";
export const dynamic = "force-dynamic";
export default async function AdminOrdersPage(props: { searchParams: Promise<{ q?: string; status?: string; tab?: string; page?: string; from?: string; to?: string; payment?: string; shipping?: string; sort?: string }> }) {
  await requireBackofficeUser(PERMISSIONS.ORDER_READ);
  return <Suspense fallback={<OperationsSkeleton />}><AdminOrdersPageContent {...props} /></Suspense>;
}
async function AdminOrdersPageContent({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; tab?: string; page?: string; from?: string; to?: string; payment?: string; shipping?: string; sort?: string }> }) {
  const params = await searchParams;
  const q = (params.q || "").slice(0, 200); const status = Object.values(OrderStatus).includes(params.status as OrderStatus) ? params.status as OrderStatus : undefined;
  const tabs: {key:string;label:string;where:Prisma.OrderWhereInput}[] = [
    {key:"all",label:"Semua",where:{}},
    {key:"verify",label:"Verifikasi",where:{status:"PENDING_PAYMENT",paymentStatus:"WAITING_VERIFICATION"}},
    {key:"process",label:"Perlu Diproses",where:{status:{in:["PAID","PROCESSING","PACKED"]}}},
    {key:"shipped",label:"Dikirim",where:{status:"SHIPPED"}},
    {key:"done",label:"Selesai",where:{status:{in:["DELIVERED","COMPLETED"]}}},
  ];
  const tab=tabs.find(t=>t.key===params.tab) ?? tabs[0];
  const search:Prisma.OrderWhereInput=q?{OR:[{orderNumber:{contains:q,mode:"insensitive"}},{address:{recipientName:{contains:q,mode:"insensitive"}}}]}:{};
  const extra:Prisma.OrderWhereInput[]=[];
  const date=(v?:string)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))?new Date(v+"T00:00:00+07:00"):undefined;
  const from=date(params.from),to=date(params.to);
  if(from||to) extra.push({createdAt:{...(from?{gte:from}:{}),...(to?{lt:new Date(to.getTime()+86400000)}:{})}});
  if(params.payment==="manual")extra.push({payment:{provider:"manual"}});
  if(params.shipping==="jnt")extra.push({shippingCourier:{contains:"J&T",mode:"insensitive"}});
  if(params.shipping==="manual")extra.push({NOT:{shippingCourier:{contains:"J&T",mode:"insensitive"}}});
  const where:Prisma.OrderWhereInput={AND:[tab.where,search,...extra,...(status?[{status}]:[])]};
  const counts=await Promise.all(tabs.map(t=>prisma.order.count({where:{AND:[t.where,search,...extra]}})));
  const { rows, total, pages, page } = await readPage(pageNumber(params.page),
    () => prisma.order.count({ where }),
    (skip, take) => prisma.order.findMany({ where, select: { id: true, orderNumber: true, createdAt: true, status: true, paymentStatus: true, total: true, shippingCourier:true, shippingService:true, items:{take:1,orderBy:{id:"asc"},select:{productName:true,variantLabel:true,quantity:true,imageUrl:true}}, address:{select:{recipientName:true}}, user: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: [{ createdAt: params.sort==="oldest"?"asc":"desc" }, { id: "desc" }], take, skip }));
  return <div className="orders-page"><header><h1>Pesanan</h1><p>Kelola dan proses pesanan toko Anda.</p></header>
    <nav className="orders-tabs" aria-label="Status pesanan">{tabs.map((t,i)=><Link key={t.key} href={`/admin/orders?${new URLSearchParams({...Object.fromEntries(Object.entries(params).filter((entry):entry is [string,string]=>typeof entry[1]==="string"&&entry[0]!=="page")),tab:t.key}).toString()}`} aria-current={tab.key===t.key?"page":undefined}>{t.label} ({counts[i]})</Link>)}</nav>
    <div className="orders-search"><FilterForm action="/admin/orders" key={JSON.stringify(params)} role="search" className="order-search-form"><input type="hidden" name="tab" value={tab.key}/><Input name="q" aria-label="Cari pesanan atau pembeli" defaultValue={q} placeholder="Cari pesanan atau pembeli" maxLength={200}/><button type="submit">Cari</button></FilterForm><OrderFilters params={params}/></div><div className="order-list-summary"><strong>{total} pesanan</strong><span>{params.sort==="oldest"?"Terlama":"Terbaru"}</span></div>
    {!rows.length?<EmptyState title="Tidak ada pesanan yang sesuai" description="Ubah pencarian atau filter pesanan."/>:<ul className="orders-cards">{rows.map(o=>{const item=o.items[0],verify=o.status==="PENDING_PAYMENT"&&o.paymentStatus==="WAITING_VERIFICATION",process=["PAID","PROCESSING","PACKED"].includes(o.status)&&o.paymentStatus==="PAID",shipped=o.status==="SHIPPED";const href=`/admin/orders/${o.id}`;return <li key={o.id} className="seller-order-card" data-testid={`admin-order-${o.orderNumber}`}><header><strong>{o.orderNumber}</strong><time>{o.createdAt.toLocaleString("id-ID",{timeZone:"Asia/Jakarta",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</time></header><span className="order-status-pill" data-stage={shipped?"shipped":verify?"verify":"process"}>{verify?"Menunggu verifikasi":process?"Perlu diproses":orderDisplayStatus(o.status,o.paymentStatus)}</span><div className="seller-order-product"><div className="order-thumb">{item?.imageUrl?<img src={item.imageUrl} alt={item.productName}/>:<Package/>}</div><div><h2>{item?.productName||"Produk pesanan"}</h2><p>{item?.variantLabel} · {item?.quantity} pcs{o._count.items>1?` · +${o._count.items-1} produk`:""}</p><p><UserRound size={16}/>{o.address?.recipientName||o.user.name}</p><p>{o.shippingCourier} · {o.shippingService}</p></div><strong>{formatIDR(o.total)}</strong></div><footer><div>Total pesanan <strong>{formatIDR(o.total)}</strong><Link href={href}>Detail pesanan ›</Link></div><Link className={shipped?"seller-order-action outline":"seller-order-action"} href={href+(verify?"#order-payment":process||shipped?"#order-shipping":"")}>{verify?"Verifikasi pembayaran":process?"Proses pengiriman":shipped?"Lacak pengiriman":"Detail pesanan"}</Link></footer></li>})}</ul>}
    <p className="orders-count">{total} pesanan ditemukan</p><PageLinks path="/admin/orders" params={{...params,q,status,tab:tab.key}} page={page} pages={pages}/>
  </div>;
}
