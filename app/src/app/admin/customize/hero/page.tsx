
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { readHeroDraft } from "@/modules/hero/service";
import { HeroEditor } from "@/components/admin/hero-editor";
export const dynamic = "force-dynamic";
export const metadata = { title: "Banner Hero | Customize" };
export default async function HeroAdminPage() {
  const user = await requireBackofficeUser(PERMISSIONS.STORE_CUSTOMIZE_READ);
  return <HeroEditor initial={await readHeroDraft()}
    canUpdate={user.permissions.includes(PERMISSIONS.STORE_CUSTOMIZE_UPDATE)}
    canPublish={user.permissions.includes(PERMISSIONS.STORE_CUSTOMIZE_PUBLISH)}/>;
}
