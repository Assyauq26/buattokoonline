import Link from "@/components/ui/navigation";
import { ArrowRight, Zap } from "lucide-react";
import { FlashSaleTimer } from "./flash-sale-timer";
import { campaignState, type CampaignClock } from "@/modules/promotions/campaign.validation";

export function FlashSaleBanner({ campaign }: { campaign: CampaignClock }) {
  const upcoming = campaignState(campaign, campaign.serverNow) === "UPCOMING";
  return (
    <section className="home-flash" data-testid="flash-sale" aria-label={campaign.name}>
      <div className="home-flash-title">
        <Zap aria-hidden="true" fill="currentColor" />
        <h2>Flash Sale<span className="home-flash-caption"> • {upcoming ? "Segera Dimulai" : "Penawaran Terbatas"}</span></h2>
      </div>
      <FlashSaleTimer campaign={campaign} segmented />
      <div className="home-flash-action">
        <Link href="/shop?flash=1" data-testid="shop-sale-btn">
          Lihat Promo <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </section>
  );
}
