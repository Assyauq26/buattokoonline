import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";
import { canReadApplicationUpdates } from "@/modules/application-updates/access";
import { readUpdateStatus } from "@/modules/application-updates/service";
import { ApplicationUpdates } from "@/components/admin/application-updates";
export const dynamic = "force-dynamic";
export const metadata = { title: "Pembaruan Aplikasi" };
export default async function ApplicationUpdatesPage() {
  const actor = await requirePermission(PERMISSIONS.AUDIT_READ);
  if (!canReadApplicationUpdates(actor)) notFound();
  return <ApplicationUpdates initial={readUpdateStatus()} />;
}
