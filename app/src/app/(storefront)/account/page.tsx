import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, Heart, MapPin, ShieldCheck, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/components/storefront/logout-button";
import { AccountSettings } from "@/components/storefront/account-settings";
import { readShippingSettings } from "@/modules/shipping/shipping-settings.service";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Akun Saya", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectTo=/account");
  const customer = await prisma.customer.findUnique({
    where: { userId: user.id },
    include: { addresses: true },
  });

  const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, name: true, email: true, phone: true, isActive: true, updatedAt: true } });
  const shipping = await readShippingSettings();
  const links = [
    { href: "/orders", icon: Package, label: "Pesanan Saya" },
    { href: "/wishlist", icon: Heart, label: "Wishlist" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black text-xl font-bold text-white">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="font-display text-2xl font-black text-ink">{user.name}</h1>
          <p className="text-sm text-ink-soft">{user.email}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {user.roles.map((r) => (
              <Badge key={r} variant="muted">{r}</Badge>
            ))}
          </div>
        </div>
      </div>

      {user.isAdmin && (
        <Link href="/admin" className="flex items-center justify-between rounded-2xl border border-black bg-black p-4 text-white" data-testid="admin-link">
          <span className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} /> Buka Panel Admin</span>
          <ChevronRight size={18} />
        </Link>
      )}

      <div className="divide-y divide-line rounded-2xl border border-line">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center justify-between p-4 hover:bg-surface" data-testid={`account-link-${l.href.slice(1)}`}>
            <span className="flex items-center gap-3 text-sm font-semibold text-ink"><l.icon size={18} /> {l.label}</span>
            <ChevronRight size={18} className="text-ink-muted" />
          </Link>
        ))}
      </div>

      {!user.isAdmin && <AccountSettings profile={{ ...profile, updatedAt: profile.updatedAt.toISOString() }} addresses={customer?.addresses || []} jnt={!!shipping.activeJnt} />}

      <LogoutButton />
    </div>
  );
}
