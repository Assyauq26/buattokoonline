import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { getManualJntConfig } from "@/infrastructure/shipping/jnt/jnt-config";

export const dynamic = "force-dynamic";
export default async function ShippingCoveragePage() {
  await requireBackofficeUser(PERMISSIONS.SHIPPING_READ);
  const release=await prisma.jntMappingRelease.findUnique({where:{key:"primary"}});
  const [manual,recent,total,verified,unmatched]=await Promise.all([
    Promise.resolve(getManualJntConfig()),
    prisma.orderAddress.findMany({
      where:{districtCode:{not:null}},orderBy:{order:{createdAt:"desc"}},
      select:{districtCode:true,district:true,city:true},distinct:["districtCode"],take:100,
    }),
    release?prisma.jntL3Mapping.count({where:{version:release.activeVersion}}):Promise.resolve(0),
    release?prisma.jntL3Mapping.count({where:{version:release.activeVersion,matchStatus:"EXACT",approvedAt:{not:null}}}):Promise.resolve(0),
    release?prisma.jntL3Mapping.count({where:{version:release.activeVersion,matchStatus:{not:"EXACT"}}}):Promise.resolve(0),
  ]);
  const codes=recent.flatMap(r=>r.districtCode?[r.districtCode]:[]);
  const mapped=release&&codes.length?await prisma.jntL3Mapping.findMany({
    where:{version:release.activeVersion,emsifaDistrictCode:{in:codes},matchStatus:"EXACT",approvedAt:{not:null}},
    select:{emsifaDistrictCode:true},
  }):[];
  const matched=new Set(mapped.map(r=>r.emsifaDistrictCode));
  const missing=recent.filter(r=>!r.districtCode||!matched.has(r.districtCode));
  return <div className="space-y-5">
    <h1 className="font-display text-2xl font-bold">Kesiapan pengiriman J&T Express</h1>
    <p className="text-sm text-zinc-600">Alamat pelanggan tetap memakai Emsifa sampai desa/kelurahan. Pengiriman menggunakan kecamatan dan kode resmi J&T yang telah divalidasi.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      {[["Mapping resmi: versi aktif",release?release.activeVersion.slice(0,12):"Belum ada"],["Kecamatan J&T",String(total)],["Kecamatan terverifikasi",String(verified)]].map(([label,value])=><div key={label} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 break-all text-lg font-bold">{value}</p></div>)}
    </div>
    <p className="text-sm">Mapping yang belum cocok/ambigu dalam rilis: {unmatched}. Tarif manual yang disetujui: {manual?manual.rates.filter(r=>Date.parse(r.validUntil)>Date.now()).length:0} aturan aktif.</p>
    <section className="space-y-3 rounded-2xl bg-white p-4">
      <h2 className="font-semibold">Kecamatan dari 100 alamat terakhir yang belum tercakup</h2>
      {missing.length?<ul className="space-y-1 text-sm">{missing.map(r=><li key={r.districtCode}>{r.district}, {r.city} ({r.districtCode})</li>)}</ul>:
        <p className="text-sm text-zinc-500">Tidak ada kecamatan yang belum terpetakan pada sampel ini. Ini bukan bukti cakupan nasional lengkap.</p>}
      <p className="text-xs text-zinc-500">Alamat legacy tanpa kode tetap dipertahankan. Verifikasi mapping dilakukan oleh administrator toko melalui proses rilis terkontrol.</p>
    </section>
  </div>;
}
