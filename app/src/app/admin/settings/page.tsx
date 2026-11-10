import { redirect } from "next/navigation";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
export default async function Settings() {
  await requireBackofficeUser();
  redirect("/admin/settings/seller");
}
