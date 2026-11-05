import { StoreWordmark } from "@/components/brand/store-wordmark";
import Link from "next/link";
import "@/components/legal/legal.css";
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="legal-page">
      <header className="legal-site-header">
        <Link href="/" className="legal-wordmark">
          <StoreWordmark />
        </Link>
        <Link href="/" className="legal-back">
          Kembali ke website <span aria-hidden="true">↗</span>
        </Link>
      </header>
      <main id="legal-main">{children}</main>
    </div>
  );
}
