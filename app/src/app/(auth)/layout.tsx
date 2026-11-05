import { StoreWordmark } from "@/components/brand/store-wordmark";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "@/components/auth/lumen/styles.css";
import "@/components/auth/auth.css";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-ui" data-theme="light">
      <header className="auth-header">
        <Link href="/" className="auth-back-home"><ArrowLeft size={19} strokeWidth={1.8} />Kembali ke Beranda</Link>
        <Link
          href="/"
          aria-label="toko ini — beranda"
          className="auth-wordmark"
        >
          <StoreWordmark />
        </Link>
      </header>
      <main className="auth-main">{children}</main>
    </div>
  );
}
