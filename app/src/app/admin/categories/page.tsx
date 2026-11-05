import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { CategoryManager } from "@/components/admin/category-manager";
export const dynamic = "force-dynamic";
export default async function CategoriesPage() {
  const user = await requireBackofficeUser(PERMISSIONS.PRODUCT_READ);
  const categories = await prisma.category.findMany({ select: { id: true, name: true, slug: true, parentId: true, sortOrder: true }, orderBy: { sortOrder: "asc" } });
  return <div className="space-y-6"><header><Link href="/admin/products" className="text-sm text-ink-soft hover:underline">Kembali ke produk</Link><h1 className="mt-3 text-2xl font-bold">Kategori</h1><p className="mt-1 text-sm text-ink-soft">Atur kategori dan hierarki katalog toko.</p></header><CategoryManager categories={categories} canCreate={user.permissions.includes(PERMISSIONS.PRODUCT_CREATE)} canEdit={user.permissions.includes(PERMISSIONS.PRODUCT_UPDATE)} /></div>;
}
