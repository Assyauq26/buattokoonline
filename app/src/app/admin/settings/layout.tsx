import { getPublishedAppearance } from "@/modules/appearance/published";
import { themeStyle } from "@/modules/appearance/runtime";
import { SettingsShell } from "@/components/admin/settings-shell";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const u = await requireBackofficeUser();
  const permissions: Record<string, string | null> = {
    seller: null,
    store: "store.customize.read",
    shipping: "shipping.read",
    "payment-methods": "payment.read",
    "bank-accounts": "bank.manage",
    "email-otp": "store.customize.publish",
    security: null,
    audit: "audit.read",
    updates: "audit.read",
  };
  return (
    <SettingsShell
      style={themeStyle((await getPublishedAppearance()).config)}
      allowed={Object.entries(permissions)
        .filter(([, p]) => !p || u.permissions.includes(p))
        .map(([k]) => k)}
    >
      {children}
    </SettingsShell>
  );
}
