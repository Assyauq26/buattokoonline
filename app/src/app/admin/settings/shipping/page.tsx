import Link from "next/link";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isJntSettingsAdministrator } from "@/infrastructure/shipping/jnt/official-config";
export default async function Page() {
  const u = await requireBackofficeUser(PERMISSIONS.SHIPPING_READ);
  return (
    <>
      <h1 className="text-2xl font-bold">Pengiriman</h1>
      <div className="grid gap-3">
        {[
          ["manual", "Pengiriman Manual"],
          ...(isJntSettingsAdministrator(u)
            ? [
                ["jnt", "API J&T Express"],
                ["jnt#warehouse", "Alamat pengirim"],
              ]
            : []),
          ["print", "Preferensi cetak AWB"],
        ].map(([href, title]) => (
          <Link
            className="rounded-xl border p-4"
            key={href}
            href={"/admin/settings/shipping/" + href}
          >
            {title}
          </Link>
        ))}
      </div>
    </>
  );
}
