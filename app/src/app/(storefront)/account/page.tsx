import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet, Package, Truck, CircleCheck, Heart, Ticket, MapPin, Settings, CircleHelp, ChevronRight, Pencil, ReceiptText, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { listOrdersForUser } from "@/modules/orders/orders.service";
import { customerOrderGroup } from "@/lib/customer-order-view";
import { LogoutButton } from "@/components/storefront/logout-button";
import "./account.css";
export const dynamic="force-dynamic";
export const metadata={title:"Akun Saya",robots:{index:false}};
export default async function AccountPage(){
 const user=await getCurrentUser(); if(!user) redirect("/login?redirectTo=/account");
 const orders=await listOrdersForUser(user.id);
 const groups=[{key:"unpaid",label:"Belum bayar",icon:Wallet},{key:"process",label:"Diproses",icon:Package},{key:"shipped",label:"Dikirim",icon:Truck},{key:"done",label:"Selesai",icon:CircleCheck}];
 const verifying=orders.filter(o=>o.status==="PENDING_PAYMENT"&&o.paymentStatus==="WAITING_VERIFICATION").length;
 return <div className="customer-account"><h1>Akun Saya</h1><section className="account-profile"><div className="account-avatar">{user.name.split(/\s+/).slice(0,2).map(s=>s[0]).join("")}</div><div><h2>{user.name}</h2><p>{user.email}</p></div>{!user.isAdmin&&<Link href="/account/settings?section=profile" className="account-edit"><Pencil size={18}/>Edit</Link>}</section>
 {user.isAdmin&&<Link className="account-admin" href="/admin" data-testid="admin-link"><ShieldCheck size={20}/>Buka Panel Admin<ChevronRight size={18}/></Link>}
 <section className="account-orders"><header><h2>Pesanan Saya</h2><Link href="/orders">Lihat semua <ChevronRight size={16}/></Link></header><div className="account-order-stats">{groups.map(g=>{const count=orders.filter(o=>customerOrderGroup(o)===g.key).length;return <Link key={g.key} href={`/orders?tab=${g.key}`}><span><g.icon size={30}/>{count>0&&<b>{count}</b>}</span>{g.label}</Link>})}</div>
 {verifying>0&&<Link className="account-notice" href="/orders?tab=process"><ReceiptText size={28}/><span><strong>Bukti pembayaran sedang diperiksa</strong><small>Kami akan memberi kabar setelah diverifikasi.</small></span><ChevronRight size={18}/></Link>}</section>
 <div className="account-shortcuts"><Link href="/wishlist"><Heart/>Wishlist</Link><Link href="/account/vouchers"><Ticket/>Voucher Saya</Link></div>
 <nav className="account-menu" aria-label="Menu akun">{[{href:"/account/settings?section=addresses",label:"Alamat Pengiriman",icon:MapPin},{href:"/account/settings?section=security",label:"Pengaturan Akun",icon:Settings},{href:"/account/help",label:"Pusat Bantuan",icon:CircleHelp}].filter(l=>!user.isAdmin||l.href==="/account/help").map(l=><Link key={l.href} href={l.href}><l.icon size={24}/>{l.label}<ChevronRight size={18}/></Link>)}</nav><LogoutButton/></div>
}
