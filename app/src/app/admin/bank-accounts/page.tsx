import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { BankAccountManager } from "@/components/admin/bank-account-manager";

export const dynamic = "force-dynamic";

export default async function AdminBankAccountsPage() {
  await requireBackofficeUser(PERMISSIONS.BANK_MANAGE);
  const accounts = await prisma.bankAccount.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink">Rekening Bank</h1>
      <BankAccountManager accounts={accounts} />
    </div>
  );
}
