import Link from "@/components/ui/navigation";
import { Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlashSaleTimer } from "./flash-sale-timer";
import type { CampaignClock } from "@/modules/promotions/campaign.validation";
export function FlashSaleBanner({ campaign }: { campaign: CampaignClock }) {
  return (
    <section
      className="relative isolate overflow-hidden rounded-xl border border-black/[0.05] p-5 sm:p-6"
      data-testid="flash-sale"
      data-theme-target="promo"
      style={{
        background: "var(--store-gradient-promo,var(--store-promo,#F7F7F7))",
        color:
          "var(--store-gradient-promo-text,var(--store-promoText,var(--store-text,#111111)))",
      }}
    >
      <Zap
        aria-hidden="true"
        size={190}
        strokeWidth={1}
        className="pointer-events-none absolute -bottom-8 -left-7 z-0 opacity-[0.04]"
      />
      <div className="relative z-10 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">Flash Sale!</h2>
          <p className="mt-1 text-2xl font-bold leading-tight">
            Harga spesial hari ini
          </p>
          <p className="mt-2 break-words text-sm">{campaign.name}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 sm:flex-col sm:items-stretch">
          <FlashSaleTimer campaign={campaign} compact />
          <Button asChild className="min-h-11">
            <Link href="/shop?flash=1" data-testid="shop-sale-btn">
              Beli Sekarang
              <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
