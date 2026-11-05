import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requireBackofficeUser(PERMISSIONS.AUDIT_READ);
  const logs = await prisma.auditLog.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink">Audit Log</h1>
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface text-left text-xs uppercase text-ink-muted">
            <tr><th className="p-3">Waktu</th><th className="p-3">Aktor</th><th className="p-3">Aksi</th><th className="p-3">Entitas</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="p-3 text-ink-muted">{new Date(l.createdAt).toLocaleString("id-ID")}</td>
                <td className="p-3">{l.user?.name ?? "system"}</td>
                <td className="p-3 font-semibold text-ink">{l.action}</td>
                <td className="p-3 text-ink-soft">{l.entity}{l.entityId ? ` #${l.entityId.slice(0, 8)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
