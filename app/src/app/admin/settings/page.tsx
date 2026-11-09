import Link from "next/link";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
export default async function Settings() {
  const u = await requireBackofficeUser();
  const items = [
    ["seller", "Informasi Seller", null],
    ["store", "Informasi Toko", "store.customize.read"],
    ["shipping", "Pengiriman", "shipping.read"],
    ["payment-methods", "Metode Pembayaran", "payment.read"],
    ["bank-accounts", "Rekening Bank", "bank.manage"],
    ["email-otp", "Email & OTP", "store.customize.publish"],
    ["security", "Keamanan Akun", null],
    ["audit", "Audit Log", "audit.read"],
    ["updates", "Update Versi", "audit.read"],
  ];
  return (
    <>
      <h1 className="text-2xl font-bold">Pengaturan</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {items
          .filter(([, , p]) => !p || u.permissions.includes(p))
          .map(([href, title]) => (
            <Link
              key={href}
              href={"/admin/settings/" + href}
              className="flex min-h-16 items-center justify-between rounded-xl border p-4"
            >
              {title}
              <span>→</span>
            </Link>
          ))}
      </div>
    </>
  );
}
