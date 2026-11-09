"use server";
import { z } from "zod";
import { requireBackofficeUser } from "./backoffice-access";
import { prisma } from "@/lib/prisma";
import { runAction } from "@/lib/action";
import { HttpError } from "@/lib/response";
import { writeAudit } from "@/modules/audit/audit.service";
import { revalidatePath } from "next/cache";
export async function saveSellerName(value: unknown) {
  return runAction(async () => {
    const actor = await requireBackofficeUser();
    const input = z
      .object({
        name: z.string().trim().min(2).max(120),
        revision: z.string().datetime(),
      })
      .strict()
      .parse(value);
    await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: {
          id: actor.id,
          isActive: true,
          updatedAt: new Date(input.revision),
        },
        data: { name: input.name },
      });
      if (result.count !== 1)
        throw new HttpError(
          "Profil berubah. Muat ulang sebelum menyimpan.",
          409,
        );
      await writeAudit(
        {
          userId: actor.id,
          action: "seller.profile.update",
          entity: "User",
          entityId: actor.id,
        },
        tx,
      );
    });
    revalidatePath("/admin", "layout");
    return { message: "Nama penanggung jawab tersimpan." };
  });
}
