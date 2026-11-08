import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { customerOnly } from "@/modules/customers/account.service";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  await requireBackofficeUser(PERMISSIONS.CUSTOMER_READ);
  const users = await prisma.user.findMany({
    where: { ...customerOnly, deletedAt: null },
    include: { roles: { include: { role: true } }, _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink">Pelanggan</h1>
      <div className="space-y-3">
        {!users.length && <p className="rounded-xl border p-5 text-sm">Belum ada pelanggan.</p>}
        {users.map(u => <Link key={u.id} href={`/admin/customers/${u.id}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border bg-white p-4" data-testid={`admin-customer-${u.id}`}>
          <div className="min-w-0"><p className="truncate font-semibold">{u.name}</p><p className="truncate text-sm text-zinc-500">{u.email}</p></div>
          <div className="shrink-0 text-right text-xs"><p>{u.isActive ? "Aktif" : "Nonaktif"}</p><p>{u._count.orders} pesanan</p></div>
        </Link>)}
      </div>
    </div>
  );
}
