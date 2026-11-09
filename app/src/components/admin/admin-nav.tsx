"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/ui/navigation";
import {
  Boxes,
  ChevronRight,
  CreditCard,
  LayoutGrid,
  Megaphone,
  Menu,
  Package,
  ShoppingBag,
  Store,
  Users,
  Settings,
} from "lucide-react";
import { ActionPopover } from "@/components/ui/action-popover";
import { cn } from "@/lib/utils";
import { PERMISSIONS } from "@/lib/auth/permissions";

const links = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutGrid,
    exact: true,
    permission: null,
  },
  {
    href: "/admin/customize",
    label: "Customize / Dekorasi Toko",
    display: "Dekorasi Toko",
    icon: Store,
    permission: PERMISSIONS.STORE_CUSTOMIZE_READ,
  },
  {
    href: "/admin/products",
    label: "Produk",
    icon: Package,
    permission: PERMISSIONS.PRODUCT_READ,
  },
  {
    href: "/admin/orders",
    label: "Pesanan",
    icon: ShoppingBag,
    permission: PERMISSIONS.ORDER_READ,
  },
  {
    href: "/admin/customers",
    label: "Pelanggan",
    icon: Users,
    permission: PERMISSIONS.CUSTOMER_READ,
  },
  {
    href: "/admin/marketing",
    label: "Marketing",
    display: "Promosi",
    icon: Megaphone,
    permission: PERMISSIONS.PROMOTION_UPDATE,
  },
  {
    href: "/admin/inventory",
    label: "Inventori",
    icon: Boxes,
    permission: PERMISSIONS.INVENTORY_READ,
  },
  {
    href: "/admin/payments",
    label: "Pembayaran",
    icon: CreditCard,
    permission: PERMISSIONS.PAYMENT_READ,
  },
  {
    href: "/admin/settings",
    label: "Pengaturan",
    icon: Settings,
    permission: null,
  },
] as const;

function allowed(permissions: string[], item: (typeof links)[number]) {
  if (item.href === "/admin/marketing")
    return (
      permissions.includes(PERMISSIONS.PROMOTION_CREATE) ||
      permissions.includes(PERMISSIONS.PROMOTION_UPDATE)
    );
  return !item.permission || permissions.includes(item.permission);
}

function activeLink(pathname: string, href: string, exact?: boolean) {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");
}

export function AdminNav({
  permissions,
}: {
  permissions: string[];
  canManageJnt?: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const visible = links.filter((item) => allowed(permissions, item));
  return (
    <nav aria-label="Navigasi admin" className="flex flex-col gap-1 px-4 py-2">
      {visible.map((item, index) => {
        if (item.href === "/admin/products" || item.href === "/admin/orders")
          return (
            <details key={item.href} open={pathname.startsWith(item.href)}>
              <summary className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-3 text-sm font-semibold">
                <item.icon size={19} />
                {item.label}
                <ChevronRight size={15} />
              </summary>
              {(item.href === "/admin/products"
                ? [
                    { href: "/admin/products", label: "Daftar Produk" },
                    { href: "/admin/products/categories", label: "Kategori" },
                  ]
                : [
                    { href: "/admin/orders", label: "Kelola Pesanan" },
                    {
                      href: "/admin/orders?tab=refund",
                      label: "Retur & Refund",
                    },
                  ]
              ).map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  className="flex min-h-11 items-center px-7 text-sm"
                  aria-current={
                    (
                      c.href.includes("?")
                        ? params.get("tab") === "refund"
                        : pathname === c.href && params.get("tab") !== "refund"
                    )
                      ? "page"
                      : undefined
                  }
                >
                  {c.label}
                </Link>
              ))}
            </details>
          );
        const active = activeLink(
          pathname,
          item.href,
          "exact" in item ? item.exact : false,
        );
        const Icon = item.icon;
        return (
          <div
            key={item.href}
            className={cn(index === 6 && "mt-4 border-t border-line pt-4")}
          >
            <Link
              href={item.href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              data-testid={`adminnav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
              className={cn(
                "group flex min-h-11 items-center gap-3 whitespace-nowrap rounded-xl text-sm font-medium transition-colors",
                "px-4 py-3",
                active
                  ? "bg-primary font-semibold text-white shadow-sm"
                  : "text-zinc-700 hover:bg-zinc-100 hover:text-black",
              )}
            >
              <Icon
                size={19}
                strokeWidth={active ? 2.25 : 1.9}
                aria-hidden="true"
              />
              <span className="flex-1">
                {("display" in item && item.display) || item.label}
              </span>
              {item.href !== "/admin" && (
                <ChevronRight
                  size={15}
                  className={active ? "text-white/80" : "text-zinc-400"}
                  aria-hidden="true"
                />
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

/** Five-icon mobile navigation shown in the supplied dashboard reference. */
export function AdminMobileBottomNav({
  permissions,
}: {
  permissions: string[];
  canManageJnt?: boolean;
}) {
  const pathname = usePathname();
  const pinned = links.filter(
    (item) =>
      [
        "/admin",
        "/admin/products",
        "/admin/orders",
        "/admin/inventory",
      ].includes(item.href) && allowed(permissions, item),
  );
  const extra = links.filter(
    (item) =>
      !pinned.some((p) => p.href === item.href) && allowed(permissions, item),
  );
  return (
    <nav
      aria-label="Navigasi bawah admin"
      className="fixed inset-x-0 bottom-0 z-40 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgb(0_0_0_/_0.11)] backdrop-blur-lg md:hidden"
    >
      <div className="mx-auto flex w-full max-w-xl items-end justify-between gap-1">
        {pinned.map((item) => {
          const active = activeLink(
            pathname,
            item.href,
            "exact" in item ? item.exact : false,
          );
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              data-testid={`adminnav-${item.label.toLowerCase()}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-medium transition-[background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                active
                  ? "bg-primary text-white shadow-sm"
                  : "text-zinc-500 hover:bg-zinc-100",
              )}
            >
              <Icon
                size={23}
                strokeWidth={active ? 2.2 : 1.9}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <ActionPopover
          label="Lainnya"
          className="min-w-0 flex-1"
          panelClassName="bottom-[calc(100%+18px)] max-h-[65dvh]"
          trigger={
            <span className="flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium text-zinc-500">
              <Menu size={23} strokeWidth={1.9} aria-hidden="true" />
              <span>Lainnya</span>
            </span>
          }
        >
          <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
            Menu lainnya{" "}
            <button
              type="button"
              aria-label="Tutup menu lainnya"
              className="grid h-11 w-11 place-items-center"
            >
              ×
            </button>
          </div>
          {extra.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                <Icon size={18} aria-hidden="true" />
                {("display" in item && item.display) || item.label}
              </Link>
            );
          })}
          <Link
            href="/"
            className="mt-1 flex min-h-11 items-center gap-3 border-t border-line px-3 text-sm"
          >
            <Store size={18} /> Buka toko
          </Link>
        </ActionPopover>
      </div>
    </nav>
  );
}
