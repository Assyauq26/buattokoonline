import { StoreWordmark } from "@/components/brand/store-wordmark";
import { getPublishedAppearance } from "@/modules/appearance/published";
import Link from "next/link";
import "@/components/legal/legal.css";
export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {config} = await getPublishedAppearance();
  return (
    <div className="legal-page" data-fashion={config.themeId === "immersive-fashion"}>
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
