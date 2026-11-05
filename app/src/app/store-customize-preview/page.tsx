import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { AppearancePreview } from "@/components/appearance/preview";
import "@/components/storefront/product-detail.css";
export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  title: "Preview dekorasi",
};
export default async function Page() {
  await requireBackofficeUser(PERMISSIONS.STORE_CUSTOMIZE_READ);
  return <AppearancePreview />;
}
