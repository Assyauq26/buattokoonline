"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { runAction } from "@/lib/action";
import { manageBankAccount } from "./bank-management.service";

export async function saveBankAccountAction(
  id: string | null,
  revision: string,
  value: unknown,
) {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.BANK_MANAGE);
    const result = await manageBankAccount(
      actor.id,
      id ? { kind: "edit", id, revision, value } : { kind: "create", value },
    );
    revalidatePath("/admin/bank-accounts");
    revalidatePath("/admin/settings/bank-accounts");
    revalidatePath("/admin/settings/payment-methods");
    revalidatePath("/checkout");
    return result;
  });
}
export async function toggleBankAccountAction(
  id: string,
  revision: string,
  active: boolean,
) {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.BANK_MANAGE);
    const result = await manageBankAccount(actor.id, {
      kind: "status",
      id,
      revision,
      active,
    });
    revalidatePath("/admin/bank-accounts");
    revalidatePath("/admin/settings/bank-accounts");
    revalidatePath("/admin/settings/payment-methods");
    revalidatePath("/checkout");
    return result;
  });
}
export async function deleteBankAccountAction(id: string, revision: string) {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.BANK_MANAGE);
    const result = await manageBankAccount(actor.id, {
      kind: "delete",
      id,
      revision,
    });
    revalidatePath("/admin/bank-accounts");
    revalidatePath("/admin/settings/bank-accounts");
    revalidatePath("/admin/settings/payment-methods");
    revalidatePath("/checkout");
    return result;
  });
}
