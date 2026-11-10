import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { prisma } from "@/lib/prisma";
import { SellerInformation } from "@/components/admin/seller-information";
export default async function Page() {
  const u = await requireBackofficeUser();
  const p = await prisma.user.findUniqueOrThrow({
    where: { id: u.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      sellerContactPhone: true,
      isActive: true,
      updatedAt: true,
    },
  });
  return (
    <SellerInformation
      profile={{
        name: p.name,
        email: p.email,
        phone: p.sellerContactPhone ?? p.phone,
        updatedAt: p.updatedAt.toISOString(),
      }}
    />
  );
}
