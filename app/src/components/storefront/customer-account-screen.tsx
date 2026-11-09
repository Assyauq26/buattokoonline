import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AccountSettings } from "./account-settings";
import { readShippingSettings } from "@/modules/shipping/shipping-settings.service";
import "@/app/(storefront)/account/account.css";
export type AccountSection = "profile" | "addresses" | "security" | "delete";
const titles = {
  profile: "Edit Profil",
  addresses: "Alamat Pengiriman",
  security: "Keamanan Akun",
  delete: "Hapus Akun",
};
export async function CustomerAccountScreen({
  section,
}: {
  section: AccountSection;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirectTo=/account/${section}`);
  if (user.isAdmin)
    return (
      <div className="account-subpage">
        <Link href="/account">← Kembali ke Akun</Link>
        <h1>{titles[section]}</h1>
        <p>Kelola profil operator melalui dashboard toko.</p>
        <Link href="/admin">Buka dashboard</Link>
      </div>
    );
  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      updatedAt: true,
    },
  });
  const customer =
    section === "addresses"
      ? await prisma.customer.findUnique({
          where: { userId: user.id },
          include: { addresses: true },
        })
      : null;
  const shipping =
    section === "addresses" ? await readShippingSettings() : null;
  return (
    <div className="account-subpage">
      <Link href="/account" className="account-subpage-back">
        ← Kembali ke Akun
      </Link>
      <h1>{titles[section]}</h1>
      <AccountSettings
        view={section}
        profile={{ ...profile, updatedAt: profile.updatedAt.toISOString() }}
        addresses={customer?.addresses || []}
        jnt={!!shipping?.activeJnt}
      />
      {section === "security" && (
        <Link href="/account/delete" className="account-subpage-back">
          Hapus Akun
        </Link>
      )}
    </div>
  );
}
