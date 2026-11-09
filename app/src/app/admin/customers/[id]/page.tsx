import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { customerOnly } from "@/modules/customers/account.service";
import { AccountSettings } from "@/components/storefront/account-settings";
export const dynamic = "force-dynamic";
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireBackofficeUser(PERMISSIONS.CUSTOMER_READ);
  const { id } = await params;
  const customer = await prisma.user.findFirst({ where: { id, ...customerOnly, deletedAt: null }, select: { id: true, name: true, email: true, phone: true, isActive: true, updatedAt: true, _count: { select: { orders: true } } } });
  if (!customer) notFound();
  return <div className="mx-auto max-w-2xl space-y-5"><Link href="/admin/customers" className="text-sm underline">Kembali ke Pelanggan</Link><h1 className="text-2xl font-bold">Detail Pelanggan</h1><p className="text-sm text-zinc-500">{customer._count.orders} pesanan tercatat</p><AccountSettings operator profile={{ ...customer, updatedAt: customer.updatedAt.toISOString() }} canUpdate={actor.permissions.includes(PERMISSIONS.CUSTOMER_UPDATE)} canDelete={actor.permissions.includes(PERMISSIONS.CUSTOMER_DELETE)} /></div>;
}
