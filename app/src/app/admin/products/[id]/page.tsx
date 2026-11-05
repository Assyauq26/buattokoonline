import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getManagedProduct, getProductEditorOptions } from "@/modules/catalog/product-management.service";
import { ProductEditor } from "@/components/admin/product-editor";
import { notFound } from "next/navigation";
import { HttpError } from "@/lib/response";
export const dynamic = "force-dynamic";
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireBackofficeUser(PERMISSIONS.PRODUCT_READ);
  try {
    const [initial, options] = await Promise.all([getManagedProduct(user, (await params).id), getProductEditorOptions(user)]);
    return <ProductEditor initial={initial} {...options} canEdit={user.permissions.includes(PERMISSIONS.PRODUCT_UPDATE)} canStock={user.permissions.includes(PERMISSIONS.INVENTORY_READ) && user.permissions.includes(PERMISSIONS.INVENTORY_ADJUST)} canArchive={user.permissions.includes(PERMISSIONS.PRODUCT_DELETE)} />;
  } catch (err) { if (err instanceof HttpError && err.status === 404) notFound(); throw err; }
}
