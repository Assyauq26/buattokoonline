import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  isJntSettingsAdministrator,
  readJntPublicStatus,
} from "@/infrastructure/shipping/jnt/official-config";
import { readShippingSettings } from "@/modules/shipping/shipping-settings.service";
import { ShippingOverview } from "@/components/admin/shipping-overview";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireBackofficeUser(PERMISSIONS.SHIPPING_READ);
  const state = await readShippingSettings(),
    canManage = isJntSettingsAdministrator(user);
  const environments = canManage
    ? await Promise.all(
        (["production", "sandbox"] as const).map(async (environment) => {
          const status = await readJntPublicStatus(environment);
          return {
            environment,
            configured: status.configured,
            address: status.seller?.warehouse.address || "",
          };
        }),
      )
    : [];
  return (
    <ShippingOverview
      canManage={canManage}
      initial={{
        manualFlat: state.manualFlat,
        activeEnvironment: state.activeJnt?.environment ?? null,
      }}
      environments={environments}
    />
  );
}
