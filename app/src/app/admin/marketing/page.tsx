import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listMarketing } from "@/modules/promotions/marketing.service";
import { prisma } from "@/lib/prisma";
import {
  listCampaigns,
  campaignProducts,
  campaignHistory,
  campaignListCount,
} from "@/modules/promotions/campaign.service";
import { PromotionWorkspace } from "@/components/admin/promotion-workspace";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Promosi",
  robots: { index: false },
};

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : undefined;
  const tab = value("tab") === "voucher" ? "voucher" : "flash";
  const query = (prefix: string) => ({
    id:
      tab === prefix && ["detail", "edit"].includes(value("view") || "")
        ? value("id")
        : undefined,
    page: value(prefix + "-page") || 1,
    search: value(prefix + "-search")?.slice(0, 160),
    status: value(prefix + "-status")?.slice(0, 32),
    from: /^\d{4}-\d{2}-\d{2}$/.test(value(prefix + "-from") || "")
      ? value(prefix + "-from")
      : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(value(prefix + "-to") || "")
      ? value(prefix + "-to")
      : undefined,
  });
  const flashQuery = query("flash"),
    voucherQuery = query("voucher");
  const historyPage = (prefix: string) => {
    const n = Number(value(prefix + "-history-page"));
    return Number.isSafeInteger(n) && n > 0 && n <= 100000 ? n : 1;
  };
  if (
    (flashQuery.id &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        flashQuery.id,
      )) ||
    (voucherQuery.id && voucherQuery.id.length > 64)
  ) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
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
    { vouchers, total: voucherTotal },
    campaigns,
    products,
    categories,
    history,
    campaignTotal,
  ] = await Promise.all([
    listMarketing(actor, voucherQuery),
    canProducts ? listCampaigns(actor, flashQuery) : Promise.resolve([]),
    canProducts
      ? campaignProducts(actor)
      : Promise.resolve({ items: [], page: 1, total: 0 }),
    canProducts
      ? prisma.category.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    canProducts
      ? campaignHistory(actor, flashQuery.id, historyPage("flash"))
      : Promise.resolve([]),
    canProducts ? campaignListCount(actor, flashQuery) : Promise.resolve(0),
  ]);
  const voucherHistory = voucherQuery.id
    ? await prisma.auditLog.findMany({
        where: { entity: "Coupon", entityId: voucherQuery.id },
        select: { id: true, action: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
        skip: (historyPage("voucher") - 1) * 20,
      })
    : [];
  const [flashHistoryTotal, voucherHistoryTotal] = await Promise.all([
    canProducts
      ? prisma.auditLog.count({
          where: {
            entity: "FlashSaleCampaign",
            ...(flashQuery.id ? { entityId: flashQuery.id } : {}),
          },
        })
      : Promise.resolve(0),
    voucherQuery.id
      ? prisma.auditLog.count({
          where: { entity: "Coupon", entityId: voucherQuery.id },
        })
      : Promise.resolve(0),
  ]);
  return (
    <PromotionWorkspace
      flash={
        canProducts
          ? {
              campaigns: campaigns.map((c) => ({
                ...c,
                startsAt: c.startsAt.toISOString(),
                endsAt: c.endsAt.toISOString(),
              })),
              initialProducts: products,
              categories,
              history: history.map((h) => ({
                ...h,
                createdAt: h.createdAt.toISOString(),
              })),
              ownerKey: actor.id,
              canCreate: actor.permissions.includes(
                PERMISSIONS.PROMOTION_CREATE,
              ),
              canUpdate: actor.permissions.includes(
                PERMISSIONS.PROMOTION_UPDATE,
              ),
              serverNow: Date.now(),
              total: campaignTotal,
              historyTotal: flashHistoryTotal,
              historyPage: historyPage("flash"),
            }
          : null
      }
      voucher={{
        vouchers: vouchers.map((v) => ({
          ...v,
          expiresAt: v.expiresAt?.toISOString() ?? null,
          startsAt: v.startsAt?.toISOString() ?? null,
          createdAt: v.createdAt.toISOString(),
        })),
        ownerKey: actor.id,
        canCreate: actor.permissions.includes(PERMISSIONS.PROMOTION_CREATE),
        canUpdate: actor.permissions.includes(PERMISSIONS.PROMOTION_UPDATE),
        asOfMs: Date.now(),
        total: voucherTotal,
        history: voucherHistory.map((h) => ({
          ...h,
          createdAt: h.createdAt.toISOString(),
        })),
        historyTotal: voucherHistoryTotal,
        historyPage: historyPage("voucher"),
      }}
    />
  );
}
