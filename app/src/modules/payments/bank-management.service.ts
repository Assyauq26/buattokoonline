import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertStaffPermission } from "@/modules/orders/transaction-locks";
import { writeAudit } from "@/modules/audit/audit.service";

const label = z.string().trim().min(2).max(100).refine(v => !/[\x00-\x1f\x7f]/.test(v), "Karakter tidak valid");
export const bankInputSchema = z.object({
  bankName: label, accountHolder: label, displayName: label,
  accountNumber: z.string().trim().regex(/^\d{3,34}$/, "Nomor rekening harus berisi 3–34 digit"),
}).strict();

type Command = { kind: "create"; value: unknown } | { kind: "edit"; id: string; revision: string; value: unknown } | { kind: "status"; id: string; revision: string; active: boolean } | { kind: "delete"; id: string; revision: string };

export async function manageBankAccount(actorId: string, command: Command) {
  const parsed = command.kind === "create" || command.kind === "edit" ? bankInputSchema.safeParse(command.value) : null;
  if (parsed && !parsed.success) throw new HttpError("Isi nama bank, pemilik, nama tampilan, dan nomor rekening 3–34 digit.", 422);
  return prisma.$transaction(async tx => {
    await assertStaffPermission(tx, actorId, PERMISSIONS.BANK_MANAGE);
    if (command.kind === "create") {
      const account = await tx.bankAccount.create({ data: parsed!.data! });
      await writeAudit({ userId: actorId, action: "bank.create", entity: "BankAccount", entityId: account.id }, tx);
      return { id: account.id, message: "Rekening ditambahkan." };
    }
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BankAccount" WHERE "id" = ${command.id} FOR UPDATE`);
    const current = await tx.bankAccount.findUnique({ where: { id: command.id } });
    if (command.kind === "delete" && (!current || current.deletedAt)) return { id: command.id, message: "Rekening sudah dihapus dari pilihan pembayaran." };
    if (!current || current.deletedAt) throw new HttpError("Rekening tidak tersedia. Muat ulang halaman.", 409);
    if (command.kind === "status" && current.isActive === command.active) return { id: current.id, message: "Status rekening sudah sesuai." };
    if (current.updatedAt.toISOString() !== command.revision) throw new HttpError("Rekening sudah berubah. Muat ulang halaman.", 409);
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    let resultId = current.id;
    if (command.kind === "edit") {
      // Immutable account versions preserve old Payment and refund references, including pending payments.
      await tx.bankAccount.update({ where: { id: current.id }, data: { isActive: false, deletedAt: updatedAt, updatedAt } });
      const replacement = await tx.bankAccount.create({ data: { ...parsed!.data!, isActive: current.isActive } });
      resultId = replacement.id;
    } else if (command.kind === "delete") {
      // Keep the immutable identity for both relational payments and refund audit references.
      await tx.bankAccount.update({ where: { id: current.id }, data: { isActive: false, deletedAt: updatedAt, updatedAt } });
    } else {
      await tx.bankAccount.update({ where: { id: current.id }, data: { isActive: command.active, updatedAt } });
    }
    await writeAudit({ userId: actorId, action: `bank.${command.kind}`, entity: "BankAccount", entityId: current.id, meta: { replacementId: resultId, ...(command.kind === "status" ? { active: command.active } : {}) } }, tx);
    return { id: resultId, message: command.kind === "edit" ? "Rekening diperbarui. Rincian pada pembayaran lama tetap disimpan." : command.kind === "delete" ? "Rekening dihapus dari pilihan pembayaran. Riwayat tetap disimpan." : "Status rekening diperbarui." };
  });
}
