"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  MessageCircle,
} from "lucide-react";
import "./settings.css";
const items = [
  ["seller", "Informasi Seller", UserRound],
  ["store", "Informasi Toko", Store],
  ["shipping", "Pengiriman", Truck],
  ["payment-methods", "Metode Pembayaran", CreditCard],
  ["bank-accounts", "Rekening Bank", Landmark],
  ["email-otp", "Email & OTP", Mail],
  ["whatsapp", "Integrasi WhatsApp", MessageCircle],
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
  const router = useRouter();
  const current = path.split("/")[3];
  return (
    <div className="settings-shell" style={style}>
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
                <span>{title}</span>
              </Link>
            ))}
        </nav>
        <section className="settings-content">
          <label className="settings-mobile-nav">
            <span>Pengaturan</span>
            <select
              aria-label="Halaman pengaturan"
              value={current || "seller"}
              onChange={(e) => router.push("/admin/settings/" + e.target.value)}
            >
              {items
                .filter(([id]) => allowed.includes(id))
                .map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
            </select>
          </label>
          {children}
        </section>
      </div>
    </div>
  );
}
