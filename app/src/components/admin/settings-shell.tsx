"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UserRound,
  Store,
  Truck,
  CreditCard,
  Landmark,
  Mail,
  Shield,
  ScrollText,
  Package,
  ChevronLeft,
} from "lucide-react";
import "./settings.css";
const items = [
  ["seller", "Informasi Seller", UserRound],
  ["store", "Informasi Toko", Store],
  ["shipping", "Pengiriman", Truck],
  ["payment-methods", "Metode Pembayaran", CreditCard],
  ["bank-accounts", "Rekening Bank", Landmark],
  ["email-otp", "Email & OTP", Mail],
  ["security", "Keamanan Akun", Shield],
  ["audit", "Audit Log", ScrollText],
  ["updates", "Update Versi", Package],
] as const;
export function SettingsShell({
  children,
  allowed,
  style,
}: {
  children: React.ReactNode;
  allowed: string[];
  style: React.CSSProperties;
}) {
  const path = usePathname();
  const current = path.split("/")[3];
  return (
    <div className="settings-shell" style={style}>
      <header className="settings-heading">
        <h1>Pengaturan toko</h1>
        <p>Kelola identitas toko dan layanan pelanggan.</p>
      </header>
      <div className="settings-workspace">
        <nav aria-label="Submenu pengaturan">
          {items
            .filter(([id]) => allowed.includes(id))
            .map(([id, title, Icon]) => (
              <Link
                key={id}
                href={"/admin/settings/" + id}
                aria-current={current === id ? "page" : undefined}
              >
                <Icon size={21} />
                <span>
                  {title}
                  {id === "seller" && <small>Data pribadi</small>}
                </span>
              </Link>
            ))}
        </nav>
        <section className="settings-content">
          <Link className="settings-back" href="/admin/settings">
            <ChevronLeft size={20} />
            Pengaturan
          </Link>
          {children}
        </section>
      </div>
    </div>
  );
}
