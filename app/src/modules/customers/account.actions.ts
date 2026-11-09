"use server";
import { revalidatePath } from "next/cache";
import { requirePermission, requireUser, destroySession } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { runAction } from "@/lib/action";
import { updateCustomerProfile, changeCustomerPassword, deleteCustomerAccount, saveCustomerAddress, changeCustomerAddress, setCustomerActive, sendCustomerRecovery } from "./account.service";
const refresh = () => { revalidatePath("/account"); revalidatePath("/admin/customers"); revalidatePath("/checkout"); };
export async function saveProfileAction(revision: string, value: unknown, targetId?: string) {
  return runAction(async () => {
    const actor = targetId ? await requirePermission(PERMISSIONS.CUSTOMER_UPDATE) : await requireUser();
    const result = await updateCustomerProfile(targetId || actor.id, revision, value, targetId ? actor.id : undefined); refresh(); return result;
  });
}
export async function passwordAction(value: unknown) {
  return runAction(async () => { const actor = await requireUser(); const result = await changeCustomerPassword(actor.id, value); await destroySession(); return result; });
}
export async function deleteAccountAction(confirmed: boolean, password?: string, targetId?: string) {
  return runAction(async () => {
    const actor = targetId ? await requirePermission(PERMISSIONS.CUSTOMER_DELETE) : await requireUser();
    const result = await deleteCustomerAccount(targetId || actor.id, { confirmed, password }, targetId ? actor.id : undefined);
    if (!targetId) await destroySession(); refresh(); return result;
  });
}
export async function customerStatusAction(id: string, revision: string, active: boolean) {
  return runAction(async () => { const actor = await requirePermission(PERMISSIONS.CUSTOMER_UPDATE); const result = await setCustomerActive(actor.id, id, revision, active); refresh(); return result; });
}
export async function customerRecoveryAction(id: string) {
  return runAction(async () => { const actor = await requirePermission(PERMISSIONS.CUSTOMER_UPDATE); return sendCustomerRecovery(actor.id, id); });
}
export async function addressSaveAction(id: string | null, value: unknown, makeDefault: boolean) {
  return runAction(async () => { const actor = await requireUser(); const result = await saveCustomerAddress(actor.id, id, value, makeDefault); refresh(); return result; });
}
export async function addressChangeAction(id: string, operation: "delete" | "default") {
  return runAction(async () => { const actor = await requireUser(); const result = await changeCustomerAddress(actor.id, id, operation); refresh(); return result; });
}
