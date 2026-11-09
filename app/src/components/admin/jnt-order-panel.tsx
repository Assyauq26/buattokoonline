"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OperationForm } from "@/components/admin/operation-form";
type State=string|null;
type Event={status:string;time:string|null;note:string|null};

export function JntOrderPanel(props:{
  orderId:string;isOfficial:boolean;service:string|null;
  status:string;hasPaid:boolean;canCreate:boolean;canUpdate:boolean;canRead:boolean;
  requestState:State;awb:string|null;shipmentStatus:string|null;
}) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [events,setEvents]=useState<Event[]|null>(null);
  if(!props.isOfficial)return null;
  const canIssue=props.canCreate&&props.hasPaid&&props.status==="PACKED"&&
    ["EZ","HBO","JND","JSD"].includes(props.service || "")&&((!props.awb&&!props.requestState)||props.requestState==="CANCELLED");
  async function track() {
    if(busy)return;
    setBusy(true);setError("");setEvents(null);
    try {
      const response=await fetch("/api/v1/admin/orders/"+encodeURIComponent(props.orderId)+"/jnt",{
        method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",
        body:JSON.stringify({action:"track"}),
      });
      const json=await response.json();
      if(!response.ok||!json.success)throw new Error(json.error?.message||"Tracking gagal");
      if(json.data.failed)throw new Error("Tracking J&T gagal. Status terakhir tetap tersimpan. Coba kembali nanti.");
      setEvents(json.data.events||[]);router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Tracking gagal");}
    finally{setBusy(false);}
  }
  return <div className="space-y-5 rounded-2xl bg-zinc-50 p-4">
    <div>
      <h3 className="font-semibold">J&T Express — API Resmi</h3>
      <p className="mt-1 text-xs text-zinc-500">Pembuatan AWB tidak menandakan paket telah diserahkan kepada kurir.</p>
      {props.requestState&&<p className="mt-2 text-sm">Status permintaan J&T: <strong>{props.requestState === "CANCELLED" ? "Pengiriman Dibatalkan" : props.requestState}</strong></p>}
      {props.requestState === "CANCELLED" && <p className="mt-2 text-sm">Pesanan tetap aktif dan pembayaran tidak dikembalikan otomatis. Anda dapat membuat resi baru setelah paket siap. Jika transaksi ingin dibatalkan, gunakan alur pembatalan pesanan dan refund yang tersedia pada detail pesanan.</p>}
      {props.awb&&<p className="mt-2 break-all text-sm">Resi: <strong>{props.awb}</strong></p>}
      {["DISPATCHED","UNKNOWN","PREPARED"].includes(props.requestState||"")&&
        <p role="alert" className="mt-2 text-sm text-amber-700">Hasil pengajuan tidak pasti. Hubungi operasional J&T untuk rekonsiliasi; jangan membuat permintaan baru.</p>}
      <p className="mt-2 text-sm text-zinc-500">Layanan pesanan: {props.service}</p>
    </div>
    {canIssue&&<OperationForm
      url={"/api/v1/admin/orders/"+props.orderId+"/jnt"}
      label={props.requestState === "CANCELLED" ? "Buat Ulang Pengiriman" : "Buat Resi"}
      confirmation="Anda akan mengirim request pembuatan resi ke sistem resmi J&T. Pastikan pesanan lunas, paket siap, alamat gudang dan penerima benar, dan data paket sudah sesuai. Jika respons tidak pasti, jangan mengulangi."
      fields={[
        {name:"action",label:"Aksi",type:"hidden",value:"create"},
      ]}
    />}
    {props.canUpdate && props.requestState === "UNKNOWN" && <OperationForm
      url={"/api/v1/admin/orders/"+props.orderId+"/jnt"}
      label="Rekonsiliasi pembatalan"
      confirmation="Gunakan hanya setelah J&T mengonfirmasi resi sudah dibatalkan melalui kanal resmi. Jangan gunakan untuk request pembuatan resi yang belum pasti. Sistem menunggu minimal 5 menit setelah permintaan pembatalan. Tindakan ini tidak membatalkan pesanan atau melakukan refund."
      fields={[
        {name:"action",label:"Aksi",type:"hidden",value:"reconcile-cancellation"},
        {name:"evidenceReference",label:"Referensi konfirmasi resmi J&T",required:true,maxLength:120},
        {name:"attested",label:"Saya sudah memeriksa bukti resmi J&T bahwa pengiriman ini dibatalkan.",type:"checkbox",required:true},
      ]}
    />}
    {props.canRead&&props.awb&&props.requestState==="SUCCEEDED"&&
      <div className="space-y-2">
        <a className="inline-flex rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold" href={`/admin/orders/${props.orderId}/awb`} target="_blank" rel="noreferrer">Cetak AWB</a>
        <button type="button" onClick={track} disabled={busy} className="min-h-11 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy?"Memeriksa...":"Perbarui Tracking"}
        </button>
        {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
        {events&&<div role="status" className="text-sm">{events.length?events.map((event,i)=>
          <p key={i} className="py-1"><strong>{event.status}</strong> {event.time||""}{event.note?" — "+event.note:""}</p>
        ):<p>Belum ada detail tracking yang dikembalikan J&T.</p>}</div>}
      </div>}
    {props.canUpdate && props.awb && props.requestState==="SUCCEEDED" &&
      props.status==="SHIPPED" && ["SHIPPED","IN_TRANSIT"].includes(props.shipmentStatus||"") &&
      <OperationForm
        url={"/api/v1/admin/orders/"+props.orderId+"/jnt"}
        label="Konfirmasi paket J&T diterima"
        confirmation="Operator wajib memeriksa bukti pengantaran dari J&T (POD atau status resmi yang valid) sebelum mengonfirmasi. Tindakan ini mencatat audit dan mengubah pesanan menjadi Diterima. Jangan konfirmasi berdasarkan nomor resi saja."
        fields={[
          {name:"action",label:"Aksi",type:"hidden",value:"deliver"},
          {name:"evidenceReference",label:"Nomor referensi bukti pengantaran J&T (tanpa data pribadi)",required:true,maxLength:120,
            hint:"Masukkan ID bukti atau referensi pemeriksaan resmi, bukan nama/telepon/alamat penerima."},
          {name:"attested",label:"Saya sudah memeriksa bukti dari J&T dan memastikan paket benar-benar diterima.",type:"checkbox",required:true},
        ]}
      />}
    {props.canUpdate&&props.awb&&props.requestState==="SUCCEEDED"&&props.shipmentStatus==="PENDING"&&props.status==="PACKED"&&
      <div className="space-y-4">
        <OperationForm
          url={"/api/v1/admin/orders/"+props.orderId+"/jnt"}
          label="Konfirmasi serah-terima ke kurir"
          confirmation="Hanya klik setelah paket benar-benar diserahkan kepada J&T. Status pesanan akan menjadi Dikirim."
          fields={[{name:"action",label:"Aksi",type:"hidden",value:"handover"}]}
        />
        <OperationForm
          url={"/api/v1/admin/orders/"+props.orderId+"/jnt"}
          label="Minta pembatalan AWB J&T"
          confirmation="Hanya boleh sebelum paket diproses kurir. Keberhasilan membatalkan AWB tidak otomatis membatalkan transaksi atau pembayaran pelanggan."
          fields={[{name:"action",label:"Aksi",type:"hidden",value:"cancel"}]}
        />
      </div>}
  </div>;
}
