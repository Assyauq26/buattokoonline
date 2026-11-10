import "@/app/admin/orders/orders.css";
import "../../customer-detail.css";
import { CustomerRefund } from "@/components/storefront/customer-refund";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserBasic } from "@/lib/auth/session";
import { HttpError } from "@/lib/response";
import { resolutionView } from "@/modules/orders/resolution.service";
import { ResolutionFlow } from "@/components/admin/resolution-flow";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ case?: string }>;
}) {
  const a = await getCurrentUserBasic(),
    { id } = await params,
    p = await searchParams;
  if (!a)
    redirect(
      `/login?redirectTo=${encodeURIComponent(`/orders/${id}/resolution${p.case ? `?case=${encodeURIComponent(p.case)}` : ""}`)}`,
    );
  const view = await resolutionView(id, { id: a.id, staff: false }).catch(
    (error) => {
      if (error instanceof HttpError && error.status === 404) notFound();
      throw error;
    },
  );
  const selected = view.cases.find((c) => c.id === p.case);
  if (p.case && !selected) notFound();
  if (selected)
    return (
      <CustomerRefund
        key={id + selected.id}
        initial={view}
        caseId={selected.id}
      />
    );
  return (
    <div className="order-workflow p-4 pb-28">
      <ResolutionFlow
        key={id + ":" + (p.case || "new")}
        view={view}
        caseId={p.case}
        staff={false}
      />
    </div>
  );
}
