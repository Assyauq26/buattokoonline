import { notFound } from "next/navigation";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { OneClickUpdate } from "@/components/admin/one-click-update";
export const dynamic = "force-dynamic";
export default async function UpdatesPage() {
  const user = await requireBackofficeUser();
  if (!user.roles.includes("Admin")) notFound();
  return (
    <OneClickUpdate
      installedVersion={process.env.STORE_INSTALLED_VERSION ?? ""}
      enabled={process.env.STORE_UPDATER_ENABLED === "1"}
    />
  );
}
