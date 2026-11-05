import { publicCampaign } from "@/modules/promotions/campaign-pricing";
import { CampaignSync } from "@/components/storefront/campaign-sync";
import { getPublishedAppearance } from "@/modules/appearance/published";
import { themeStyle, isLegacy } from "@/modules/appearance/runtime";
import { AppearanceProvider, StoreLogo, PublishedVersionSync } from "@/components/appearance/context";
import Link from "next/link";
import { ChevronLeft, Lock } from "lucide-react";

export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const [appearance,campaign] = await Promise.all([getPublishedAppearance(),publicCampaign()]);
  return (
    <AppearanceProvider config={appearance.config}>
    <div className={`${isLegacy(appearance.config) ? "storefront-checkout-root" : "storefront-root"} min-h-screen bg-white`} data-theme-active={!isLegacy(appearance.config)} style={themeStyle(appearance.config)}>
      <CampaignSync initial={campaign}/>
      <PublishedVersionSync version={appearance.version} />
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="container flex items-center justify-between py-4">
          <Link href="/cart" className="flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
            <ChevronLeft size={18} /> Kembali
          </Link>
          <span className="font-display text-xl font-extrabold"><StoreLogo /></span>
          <span className="flex items-center gap-1 text-xs text-ink-muted"><Lock size={14} /> Aman</span>
        </div>
      </header>
      <main className="container py-6">{children}</main>
    </div>
    </AppearanceProvider>
  );
}
