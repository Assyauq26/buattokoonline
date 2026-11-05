import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isJntSettingsAdministrator } from "@/infrastructure/shipping/jnt/official-config";
import { localJntSettings } from "@/infrastructure/shipping/jnt/seller-config";
import { JntIntegrationSettings } from "@/components/admin/jnt-integration-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrasi J&T Express", robots: { index: false } };

export default async function JntIntegrationPage() {
  const user = await getCurrentUser(false);
  if (!user) redirect("/login?redirectTo=/admin/integrations/jnt");
  if (!isJntSettingsAdministrator(user)) notFound();
  return <JntIntegrationSettings localStore={localJntSettings()} />;
}
