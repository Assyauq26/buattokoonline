import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PrintPreferences } from "@/components/admin/print-preferences";
export default async function Page() {
  await requireBackofficeUser(PERMISSIONS.SHIPPING_READ);
  return <PrintPreferences />;
}
