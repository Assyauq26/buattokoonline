"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { formatIDR } from "@/lib/money";
type Page={source:{health:string;lastCheckedAt:string|null};transactions:Array<{id:string;amount:number|null;occurredAt:string|null;providerStatus:string;bankTxId:string|null;reason:string;order:{id:string;orderNumber:string}|null}>;nextCursor:string|null;logs:Array<{id:string;action:string;createdAt:string}>;coverage:string};
export function GoPayTransactions({sources}:{sources:Array<{id:string;label:string}>}){
  const [source,setSource]=useState(sources[0]?.id||""),[month,setMonth]=useState(new Date(Date.now()+7*3600000).toISOString().slice(0,7)),[status,setStatus]=useState(""),[cursor,setCursor]=useState(""),[page,setPage]=useState<Page|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!sources.some(s=>s.id===source)){setSource(sources[0]?.id||"");setCursor("");}},[sources,source]);
  useEffect(()=>{
    if(!source)return;const controller=new AbortController();setBusy(true);setMessage("");setPage(null);
    const query=new URLSearchParams({sourceId:source,month,status,...(cursor?{cursor}:{})});
    void fetch("/api/v1/admin/payment-evidence/gopay-transactions?"+query,{cache:"no-store",signal:controller.signal}).then(async r=>{
      const body=await r.json();if(!r.ok || !body.success)throw Error(body.error?.message||"Mutasi belum dapat dibaca");setPage(body.data);
    }).catch(e=>{if(!controller.signal.aborted){setPage(null);setMessage(e instanceof Error?e.message:"Pemeriksaan tertunda");}}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return ()=>controller.abort();
  },[source,month,status,cursor]);
  if(!sources.length)return null;
  const input="min-h-11 rounded-xl border border-zinc-200 bg-white p-2 text-sm";
  return <section className="settings-card space-y-4" aria-busy={busy}>
    <h2>Mutasi merchant</h2><p className="text-sm text-zinc-600">Data yang telah dibaca worker, bukan daftar seluruh mutasi provider. Riwayat dipaginasi; permintaan customer tidak membuka mutasi merchant.</p>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Merchant" className={input} value={source} onChange={e=>{setSource(e.target.value);setCursor("");}}>{sources.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>
      <input type="month" aria-label="Bulan mutasi WIB" className={input} value={month} onChange={e=>{setMonth(e.target.value);setCursor("");}} />
      <select aria-label="Status mutasi" className={input} value={status} onChange={e=>{setStatus(e.target.value);setCursor("");}}><option value="">Semua status</option>{["SETTLEMENT","CAPTURE","REFUND","PARTIAL_REFUND","PENDING","FAILED"].map(s=><option key={s}>{s}</option>)}</select>
    </div>
    <p role="status" className="text-sm">{busy?"Membaca mutasi…":message}</p>
    {!busy && page?.transactions.length===0 && <p className="rounded-xl bg-zinc-50 p-3 text-sm">Belum ada mutasi terbaca pada filter ini. Periksa koneksi dan tunggu worker; ini tidak membuktikan tidak ada transaksi di provider.</p>}
    <ul className="divide-y divide-zinc-100">{page?.transactions.map(row=><li key={row.id} className="space-y-1 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{row.amount===null?"Nominal tidak dikenal":formatIDR(row.amount)}</strong><span>{row.providerStatus}</span></div>
      <p>{row.occurredAt?new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(row.occurredAt))+" WIB":"Waktu belum diketahui"}</p>
      <p className="break-all text-xs text-zinc-500">ID transaksi: {row.bankTxId||"Belum tersedia"}</p>
      {row.order?<Link className="underline underline-offset-4" href={`/admin/orders/${row.order.id}`}>{row.order.orderNumber}</Link>:<p className="text-zinc-600">{row.providerStatus!=="SETTLEMENT"?"Bukan dana masuk dengan status settlement.":"Belum cocok dengan satu tagihan aktif atau nominal berbeda."}</p>}
      {row.reason==="SOURCE_CHANGED_REQUIRES_REVIEW" && <p className="rounded-lg bg-zinc-100 p-2 text-zinc-950">Status sumber berubah; periksa refund atau konflik. Klaim asli tidak dihapus atau digunakan ulang.</p>}
    </li>)}</ul>
    <div className="flex gap-2"><button type="button" className={input} disabled={!cursor||busy} onClick={()=>setCursor("")}>Halaman awal</button><button type="button" className={input} disabled={!page?.nextCursor||busy} onClick={()=>setCursor(page!.nextCursor!)}>Halaman berikutnya</button></div>
    {page && <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Riwayat pemeriksaan dan sesi</summary><ul className="space-y-2 text-xs">{page.logs.map(log=><li key={log.id}>{new Date(log.createdAt).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})} WIB · {log.action.replaceAll("_"," ")}</li>)}</ul><p className="mt-3 text-xs text-zinc-500">{page.coverage}</p></details>}
  </section>;
}
