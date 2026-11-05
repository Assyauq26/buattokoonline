import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { legalProfile, privacySections } from "@/config/legal";
export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description:
    "Draf kebijakan privasi toko ini: data akun dan transaksi, bukti pembayaran, sesi, penyedia layanan, retensi, dan hak pemilik data.",
  alternates: { canonical: `${legalProfile.siteOrigin}/kebijakan-privasi` },
  robots: { index: legalProfile.status === "approved", follow: true },
};
export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Kebijakan Privasi"
      intro="Ketahui data yang diproses, tujuannya, dan pilihan yang Anda miliki saat menggunakan toko ini."
      sections={privacySections}
    />
  );
}
