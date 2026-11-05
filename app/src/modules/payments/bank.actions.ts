"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { runAction } from "@/lib/action";
import { writeAudit } from "@/modules/audit/audit.service";

const schema = z.object({
  bankName: z.string().min(1),
  accountNumber: z.string().min(3),
  accountHolder: z.string().min(2),
  displayName: z.string().min(2),
});

export async function createBankAccountAction(_prev: unknown, formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false as const, error: "Data rekening tidak lengkap" };
  const res = await runAction(async () => {
    const admin = await requirePermission(PERMISSIONS.BANK_MANAGE);
    const acct = await prisma.bankAccount.create({ data: parsed.data });
    await writeAudit({ userId: admin.id, action: "bank.create", entity: "BankAccount", entityId: acct.id });
    return acct;
  });
  revalidatePath("/admin/bank-accounts");
  return res;
}

export async function toggleBankAccountAction(id: string) {
  return runAction(async () => {
    await requirePermission(PERMISSIONS.BANK_MANAGE);
    const acct = await prisma.bankAccount.findUnique({ where: { id } });
    if (acct) await prisma.bankAccount.update({ where: { id }, data: { isActive: !acct.isActive } });
    revalidatePath("/admin/bank-accounts");
    return { ok: true };
  });
}
