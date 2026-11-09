import "../../orders.css";
import { orderWorkflowStyle } from "@/modules/orders/order-workflow-theme";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resolutionView } from "@/modules/orders/resolution.service";
import { ResolutionFlow } from "@/components/admin/resolution-flow";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ case?: string; mode?: string }>;
}) {
  const a = await requireBackofficeUser(PERMISSIONS.ORDER_READ),
    { id } = await params,
    p = await searchParams;
  const view = await resolutionView(id, { id: a.id, staff: true });
  return (
    <ResolutionFlow
      key={id + ":" + (p.case || p.mode || "new")}
      style={await orderWorkflowStyle()}
      view={view}
      caseId={p.case}
      mode={p.mode === "CANCEL" ? "CANCEL" : "RETURN"}
      staff
      permissions={a.permissions}
    />
  );
}
