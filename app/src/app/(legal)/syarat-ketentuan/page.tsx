import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { legalProfile, termsSections } from "@/config/legal";
export const metadata: Metadata = {
  title: "Syarat & Ketentuan",
  description:
    "Draf syarat penggunaan toko ini: akun, pembelian fashion, pembayaran transfer bank manual, pengiriman, dan penyelesaian keluhan.",
  alternates: { canonical: `${legalProfile.siteOrigin}/syarat-ketentuan` },
  robots: { index: legalProfile.status === "approved", follow: true },
};
export default function TermsPage() {
  return (
    <LegalDocument
      title="Syarat & Ketentuan"
      intro="Pahami penggunaan layanan, proses pemesanan, dan hak Anda saat berbelanja di toko ini."
      sections={termsSections}
    />
  );
}
