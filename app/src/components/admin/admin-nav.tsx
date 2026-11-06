"use client";

import { usePathname } from "next/navigation";
import Link from "@/components/ui/navigation";
import {
  Boxes, ChevronRight, CreditCard,
  Landmark, LayoutGrid, Megaphone, Menu, Package, ScrollText,
  ShoppingBag, Store, Truck, Users, PlugZap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PERMISSIONS } from "@/lib/auth/permissions";

const links = [
  { href: "/admin", label: "Dashboard", icon: LayoutGrid, exact: true, permission: null },
  { href: "/admin/customize", label: "Customize / Dekorasi Toko", display: "Dekorasi Toko", icon: Store, permission: PERMISSIONS.STORE_CUSTOMIZE_READ },
  { href: "/admin/customize/hero", label: "Banner Hero", icon: Megaphone, permission: PERMISSIONS.STORE_CUSTOMIZE_READ },
  { href: "/admin/products", label: "Produk", icon: Package, permission: PERMISSIONS.PRODUCT_READ },
  { href: "/admin/orders", label: "Pesanan", icon: ShoppingBag, permission: PERMISSIONS.ORDER_READ },
  { href: "/admin/customers", label: "Pelanggan", icon: Users, permission: PERMISSIONS.CUSTOMER_READ },
  { href: "/admin/marketing", label: "Marketing", display: "Promosi", icon: Megaphone, permission: PERMISSIONS.PROMOTION_UPDATE },
  { href: "/admin/inventory", label: "Inventori", icon: Boxes, permission: PERMISSIONS.INVENTORY_READ },
  { href: "/admin/categories", label: "Kategori", icon: LayoutGrid, permission: PERMISSIONS.PRODUCT_READ },
  { href: "/admin/payments", label: "Pembayaran", icon: CreditCard, permission: PERMISSIONS.PAYMENT_READ },
  { href: "/admin/shipping", label: "Pengiriman", icon: Truck, permission: PERMISSIONS.SHIPPING_READ },
  { href: "/admin/integrations/jnt", label: "Integrasi J&T Express", icon: PlugZap, permission: null },
  { href: "/admin/bank-accounts", label: "Rekening Bank", icon: Landmark, permission: PERMISSIONS.BANK_MANAGE },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText, permission: PERMISSIONS.AUDIT_READ },
  { href: "/admin/updates", label: "Update Versi", icon: Package, permission: PERMISSIONS.AUDIT_READ },
] as const;

function allowed(permissions: string[], item: (typeof links)[number], canManageJnt: boolean) {
  if (item.href === "/admin/integrations/jnt") return canManageJnt;
  if (item.href === "/admin/marketing")
    return permissions.includes(PERMISSIONS.PROMOTION_CREATE) || permissions.includes(PERMISSIONS.PROMOTION_UPDATE);
  return !item.permission || permissions.includes(item.permission);
}

function activeLink(pathname: string, href: string, exact?: boolean) {
  return exact || href === "/admin/customize"
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");
}

export function AdminNav({ permissions, canManageJnt = false }: { permissions: string[]; canManageJnt?: boolean }) {
  const pathname = usePathname();
  const visible = links.filter(item => allowed(permissions, item, canManageJnt));
  return (
    <nav aria-label="Navigasi admin" className="flex flex-col gap-1 px-4 py-2">
      {visible.map((item, index) => {
        if (item.href === "/admin/integrations/jnt") return null;
        if (item.href === "/admin/shipping") return <details key={item.href} open={pathname.startsWith("/admin/shipping") || pathname.startsWith("/admin/integrations/jnt")} className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold"><Truck size={19} />Pengiriman<ChevronRight size={15} className="ml-auto group-open:rotate-90" /></summary>
          {[{ href: "/admin/shipping", label: "Pengiriman Manual" }, ...(canManageJnt ? [{ href: "/admin/integrations/jnt", label: "API J&T Express" }] : [])].map(child =>
            <Link key={child.href} href={child.href} aria-current={pathname === child.href ? "page" : undefined}
              className={cn("my-1 flex min-h-10 items-center gap-3 rounded-lg px-5 text-sm", pathname === child.href ? "bg-primary font-semibold text-white" : "text-zinc-700 hover:bg-zinc-100")}>
              <span aria-hidden="true">•</span>{child.label}
            </Link>)}
        </details>;
        const active = activeLink(pathname, item.href, "exact" in item ? item.exact : false);
        const Icon = item.icon;
        return (
          <div key={item.href} className={cn(index === 6 && "mt-4 border-t border-line pt-4")}>
            <Link
              href={item.href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              data-testid={`adminnav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
              className={cn(
                "group flex min-h-11 items-center gap-3 whitespace-nowrap rounded-xl text-sm font-medium transition-colors",
                "px-4 py-3",
                active ? "bg-primary font-semibold text-white shadow-sm" : "text-zinc-700 hover:bg-zinc-100 hover:text-black",
              )}
            >
              <Icon size={19} strokeWidth={active ? 2.25 : 1.9} aria-hidden="true" />
              <span className="flex-1">{("display" in item && item.display) || item.label}</span>
              {item.href !== "/admin" && <ChevronRight size={15} className={active ? "text-white/80" : "text-zinc-400"} aria-hidden="true" />}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

/** Five-icon mobile navigation shown in the supplied dashboard reference. */
export function AdminMobileBottomNav({ permissions, canManageJnt = false }: { permissions: string[]; canManageJnt?: boolean }) {
  const pathname = usePathname();
  const pinned = links.filter(item => ["/admin", "/admin/products", "/admin/orders", "/admin/inventory"].includes(item.href) && allowed(permissions, item, canManageJnt));
  const extra = links.filter(item => !pinned.some(p => p.href === item.href) && allowed(permissions, item, canManageJnt));
  return (
    <nav aria-label="Navigasi bawah admin" className="fixed inset-x-0 bottom-0 z-40 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgb(0_0_0_/_0.11)] backdrop-blur-lg md:hidden">
      <div className="mx-auto flex w-full max-w-xl items-end justify-between gap-1">
        {pinned.map(item => {
          const active = activeLink(pathname, item.href, "exact" in item ? item.exact : false);
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} prefetch={false}
            data-testid={`adminnav-${item.label.toLowerCase()}`}
            aria-current={active ? "page" : undefined}
            className={cn("flex min-h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-medium transition-[background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", active ? "bg-primary text-white shadow-sm" : "text-zinc-500 hover:bg-zinc-100")}>
            <Icon size={23} strokeWidth={active ? 2.2 : 1.9} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>;
        })}
        <details className="group relative min-w-0 flex-1">
          <summary className="flex min-h-[58px] cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium text-zinc-500 transition-colors duration-300 hover:bg-zinc-100 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
            <Menu size={23} strokeWidth={1.9} aria-hidden="true" />
            <span>Lainnya</span>
          </summary>
          <div className="absolute bottom-[calc(100%+18px)] right-0 w-60 max-h-[65vh] overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-2xl">
            <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">Menu lainnya <Menu size={16} /></div>
            {extra.map(item => {
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} prefetch={false} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-zinc-700 hover:bg-zinc-100">
                <Icon size={18} aria-hidden="true" />{("display" in item && item.display) || item.label}
              </Link>;
            })}
            <Link href="/" className="mt-1 flex min-h-11 items-center gap-3 border-t border-line px-3 text-sm"><Store size={18}/> Buka toko</Link>
          </div>
        </details>
      </div>
    </nav>
  );
}
