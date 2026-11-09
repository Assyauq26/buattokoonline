import { getPublishedAppearance } from "@/modules/appearance/published";
import type { CSSProperties } from "react";
import { StoreWordmark } from "@/components/brand/store-wordmark";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "@/components/auth/lumen/styles.css";
import "@/components/auth/auth.css";
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { config } = await getPublishedAppearance();
  const style = { "--auth-primary": config.colors.primary, "--auth-hover": config.colors.primaryHover, "--auth-pressed": config.colors.primaryPressed, "--auth-foreground": config.colors.primaryText } as CSSProperties;
  return (
    <div className="auth-ui" style={style} data-theme="light">
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
