import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { normalizeRegistrationPhone } from "@/modules/auth/registration-otp";
import { writeAudit } from "@/modules/audit/audit.service";
import { Prisma } from "@prisma/client";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
export async function saveSellerContact(actorId: string, value: unknown) {
  const input = z
    .object({
      name: z.string().trim().min(2).max(120),
      phone: z.string().trim().max(40),
      revision: z.string().datetime(),
    })
    .strict()
    .safeParse(value);
  if (!input.success)
    throw new HttpError("Periksa nama dan Nomor HP Anda.", 422);
  const phone = input.data.phone
    ? normalizeRegistrationPhone(input.data.phone)
    : "";
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "User" WHERE id = ${actorId} FOR UPDATE`,
    );
    const current = await tx.user.findFirst({
      where: {
        id: actorId,
        isActive: true,
        deletedAt: null,
        roles: { some: { role: { name: { in: [...ADMIN_ROLES] } } } },
      },
    });
    if (!current)
      throw new HttpError("Akses profil seller tidak tersedia.", 403);
    if (current.updatedAt.toISOString() !== input.data.revision)
      throw new HttpError("Profil berubah. Muat ulang sebelum menyimpan.", 409);
    const saved = await tx.user.update({
      where: { id: actorId },
      data: {
        name: input.data.name,
        sellerContactPhone: phone,
        updatedAt: new Date(
          Math.max(Date.now(), current.updatedAt.getTime() + 1),
        ),
      },
    });
    await writeAudit(
      {
        userId: actorId,
        action: "seller.profile.update",
        entity: "User",
        entityId: actorId,
      },
      tx,
    );
    return {
      message: "Profil seller tersimpan.",
      name: saved.name,
      phone,
      revision: saved.updatedAt.toISOString(),
    };
  });
}
