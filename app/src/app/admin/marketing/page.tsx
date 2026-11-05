import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listMarketing } from "@/modules/promotions/marketing.service";
import { prisma } from "@/lib/prisma";
import {
  listCampaigns,
  campaignProducts,
  campaignHistory,
} from "@/modules/promotions/campaign.service";
import { FlashCampaignManager } from "@/components/admin/flash-campaign-manager";
import { MarketingManager } from "@/components/admin/marketing-manager";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Marketing",
  robots: { index: false },
};

export default async function MarketingPage() {
  const actor = await requireBackofficeUser();
  if (
    ![PERMISSIONS.PROMOTION_CREATE, PERMISSIONS.PROMOTION_UPDATE].some((p) =>
      actor.permissions.includes(p),
    )
  ) {
    // Same safe not-found boundary used by other backoffice pages.
    const { notFound } = await import("next/navigation");
    notFound();
  }
  const canProducts = actor.permissions.includes(PERMISSIONS.PRODUCT_READ);
  const [
    { vouchers, activeVouchers },
    campaigns,
    products,
    categories,
    history,
  ] = await Promise.all([
    listMarketing(actor),
    canProducts ? listCampaigns(actor) : Promise.resolve([]),
    canProducts
      ? campaignProducts(actor)
      : Promise.resolve({ items: [], page: 1, total: 0 }),
    canProducts
      ? prisma.category.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    canProducts ? campaignHistory(actor) : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Marketing</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Kelola kampanye Flash Sale terpusat dan voucher checkout.{" "}
          {activeVouchers} voucher aktif.
        </p>
      </header>
      {canProducts && (
        <FlashCampaignManager
          campaigns={campaigns.map((c) => ({
            ...c,
            startsAt: c.startsAt.toISOString(),
            endsAt: c.endsAt.toISOString(),
          }))}
          initialProducts={products}
          categories={categories}
          history={history.map((h) => ({
            ...h,
            createdAt: h.createdAt.toISOString(),
          }))}
          canCreate={actor.permissions.includes(PERMISSIONS.PROMOTION_CREATE)}
          canUpdate={actor.permissions.includes(PERMISSIONS.PROMOTION_UPDATE)}
          serverNow={Date.now()}
        />
      )}
      <MarketingManager
        vouchers={vouchers.map((v) => ({
          ...v,
          expiresAt: v.expiresAt?.toISOString() ?? null,
          startsAt: v.startsAt?.toISOString() ?? null,
          createdAt: v.createdAt.toISOString(),
        }))}
        canCreate={actor.permissions.includes(PERMISSIONS.PROMOTION_CREATE)}
        canUpdate={actor.permissions.includes(PERMISSIONS.PROMOTION_UPDATE)}
        asOfMs={Date.now()}
      />
    </div>
  );
}
