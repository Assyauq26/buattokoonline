import "@/app/admin/orders/orders.css";
import { requireUser } from "@/lib/auth/session";
import { resolutionView } from "@/modules/orders/resolution.service";
import { ResolutionFlow } from "@/components/admin/resolution-flow";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ case?: string }>;
}) {
  const a = await requireUser(),
    { id } = await params,
    p = await searchParams;
  const view = await resolutionView(id, { id: a.id, staff: false });
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
