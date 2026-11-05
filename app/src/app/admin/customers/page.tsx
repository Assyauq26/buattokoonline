import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  await requireBackofficeUser(PERMISSIONS.CUSTOMER_READ);
  const users = await prisma.user.findMany({
    include: { roles: { include: { role: true } }, _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink">Pelanggan</h1>
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface text-left text-xs uppercase text-ink-muted">
            <tr><th className="p-3">Nama</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Pesanan</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id} data-testid={`admin-customer-${u.id}`}>
                <td className="p-3 font-semibold text-ink">{u.name}</td>
                <td className="p-3 text-ink-soft">{u.email}</td>
                <td className="p-3">{u.roles.map((r) => <Badge key={r.roleId} variant="muted" className="mr-1">{r.role.name}</Badge>)}</td>
                <td className="p-3">{u._count.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
