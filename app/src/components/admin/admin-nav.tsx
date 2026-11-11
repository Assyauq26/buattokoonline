"use client";

import { useEffect, useState } from "react";
import "./admin-nav.css";
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

function NavDisclosure({
  item,
  pathname,
  refund,
}: {
  item: (typeof links)[number];
  pathname: string;
  refund: boolean;
}) {
  const active = activeLink(pathname, item.href);
  const [open, setOpen] = useState(active);
  const [animate, setAnimate] = useState(false);
  const id = "nav-" + item.href.split("/").pop();
  useEffect(() => {
    if (active) {
      setAnimate(false);
      setOpen(true);
    }
  }, [pathname, refund, active]);
  const children =
    item.href === "/admin/products"
      ? [
          { href: "/admin/products", label: "Daftar Produk" },
          { href: "/admin/products/categories", label: "Kategori" },
        ]
      : [
          { href: "/admin/orders", label: "Kelola Pesanan" },
          { href: "/admin/orders?tab=refund", label: "Retur & Refund" },
        ];
  return (
    <div className="admin-disclosure" data-open={open} data-animate={animate}>
      <button
        type="button"
        className="admin-nav-row"
        data-active={active}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          setAnimate(e.detail !== 0);
          setOpen((v) => !v);
        }}
      >
        <item.icon size={19} aria-hidden="true" />
        <span>{item.label}</span>
        <ChevronRight
          className="admin-nav-chevron"
          size={15}
          aria-hidden="true"
        />
      </button>
      <div id={id} className="admin-nav-children" aria-hidden={!open}>
        <div>
          {children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className="admin-nav-child"
              tabIndex={open ? undefined : -1}
              aria-current={
                (
                  child.href.includes("?")
                    ? pathname === "/admin/orders" && refund
                    : pathname === child.href && !refund
                )
                  ? "page"
                  : undefined
              }
            >
              {child.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
export function AdminNav({
  permissions,
}: {
  permissions: string[];
  canManageJnt?: boolean;
}) {
  const pathname = usePathname(),
    params = useSearchParams();
  return (
    <nav aria-label="Navigasi admin" className="admin-nav">
      {links
        .filter((item) => allowed(permissions, item))
        .map((item) =>
          item.href === "/admin/products" || item.href === "/admin/orders" ? (
            <NavDisclosure
              key={item.href}
              item={item}
              pathname={pathname}
              refund={params.get("tab") === "refund"}
            />
          ) : (
            <Link
              key={item.href}
              href={
                item.href === "/admin/settings"
                  ? "/admin/settings/seller"
                  : item.href
              }
              prefetch={false}
              className={cn(
                "admin-nav-row",
                item.href === "/admin/inventory" && "admin-nav-divider",
              )}
              data-testid={`adminnav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
              aria-current={
                activeLink(
                  pathname,
                  item.href,
                  "exact" in item ? item.exact : false,
                )
                  ? "page"
                  : undefined
              }
            >
              <item.icon size={19} aria-hidden="true" />
              <span>{("display" in item && item.display) || item.label}</span>
            </Link>
          ),
        )}
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
