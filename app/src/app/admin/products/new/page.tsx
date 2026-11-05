import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getProductEditorOptions } from "@/modules/catalog/product-management.service";
import { ProductEditor } from "@/components/admin/product-editor";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function NewProductPage() {
  const user = await requireBackofficeUser(PERMISSIONS.PRODUCT_CREATE);
  if (!user.permissions.includes(PERMISSIONS.PRODUCT_READ)) notFound();
  const options = await getProductEditorOptions(user);
  return <ProductEditor {...options} canEdit canStock={user.permissions.includes(PERMISSIONS.INVENTORY_READ) && user.permissions.includes(PERMISSIONS.INVENTORY_ADJUST)} canArchive={false} />;
}
