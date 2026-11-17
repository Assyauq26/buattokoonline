"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Menu,
  ArrowLeft,
  Heart,
  House,
  Search,
  ShoppingBag,
  UserRound,
  X,
  Package,
  MapPin,
  LockKeyhole,
  CircleHelp,
} from "lucide-react";
import { StoreLogo, useAppearance } from "@/components/appearance/context";
import { CART_COUNT_EVENT } from "@/modules/cart/cart-events";

export function FashionShell({
  count = 0,
  signedIn = false,
  children,
}: {
  count?: number;
  signedIn?: boolean;
  children: React.ReactNode;
}) {
  const { config, preview } = useAppearance();
  const pathname = usePathname();
  const path = preview ? "/" : pathname;
  const router = useRouter();
  const drawer = useRef<HTMLDialogElement>(null);
  const previous = useRef("");
  const last = useRef(path);
  const [units, setUnits] = useState(count);
  const account = signedIn ? "/account" : "/login?redirectTo=/account";
  const browse =
    ["/", "/shop", "/search", "/wishlist", "/account"].includes(path) ||
    /^\/(category|brand)\//.test(path);
  const accountArea = path.startsWith("/account") || path.startsWith("/orders");
  const links = config.header.links.filter((l) => l.visible);
  useEffect(() => {
    if (last.current !== path) {
      previous.current = last.current;
      last.current = path;
    }
    drawer.current?.close();
  }, [path]);
  useEffect(() => setUnits(count), [count]);
  useEffect(() => {
    const update = (e: Event) => {
      const value = (e as CustomEvent<number | { delta: number }>).detail;
      setUnits((n) =>
        Math.max(0, typeof value === "number" ? value : n + value.delta),
      );
    };
    window.addEventListener(CART_COUNT_EVENT, update);
    return () => window.removeEventListener(CART_COUNT_EVENT, update);
  }, []);
  function back() {
    if (previous.current) {
      router.back();
      return;
    }
    if (path.startsWith("/product/")) {
      try {
        const url = sessionStorage.getItem("fashion-return");
        if (url?.startsWith("/?koleksi=")) {
          router.push(url);
          return;
        }
      } catch {}
    }
    router.push(
      path.startsWith("/orders/")
        ? "/orders"
        : path.startsWith("/account/")
          ? "/account"
          : path === "/checkout"
            ? "/cart"
            : path.startsWith("/checkout/payment/")
              ? "/orders"
              : path === "/forgot-password" || path === "/register"
                ? "/login"
                : "/",
    );
  }
  const nav = [
    { label: "Beranda", href: "/", Icon: House },
    { label: "Search", href: "/search", Icon: Search },
    { label: "Keranjang", href: "/cart", Icon: ShoppingBag },
    { label: "Profil", href: account, Icon: UserRound },
  ];
  const badge = units > 0 && (
    <small aria-label={units + " unit di keranjang"}>{units}</small>
  );
  return (
    <>
      <header className="fashion-header" data-home={path === "/"}>
        <div className="fashion-header-inner">
          <button
            type="button"
            className="fashion-mobile-control"
            aria-label={path === "/" ? "Buka menu" : "Kembali"}
            onClick={() =>
              path === "/" ? drawer.current?.showModal() : back()
            }
          >
            {path === "/" ? <Menu /> : <ArrowLeft />}
          </button>
          <Link
            className="fashion-brand"
            href="/"
            aria-label={config.identity.name}
          >
            <StoreLogo />
          </Link>
          <nav className="fashion-links" aria-label="Koleksi toko">
            {links.map((l) => (
              <Link key={l.id} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="fashion-tools">
            <Link href="/search" aria-label="Search">
              <Search />
            </Link>
            <Link href="/wishlist" aria-label="Wishlist">
              <Heart />
            </Link>
            <Link href="/cart" aria-label="Keranjang">
              <ShoppingBag />
              {badge}
            </Link>
            <Link href={account} aria-label="Profil">
              <UserRound />
            </Link>
          </div>
        </div>
      </header>
      <dialog
        ref={drawer}
        className="fashion-drawer"
        aria-label="Menu toko"
        onClick={(e) => {
          if (e.target === drawer.current) drawer.current.close();
        }}
      >
        <div>
          <button
            autoFocus
            aria-label="Tutup menu"
            onClick={() => drawer.current?.close()}
          >
            <X />
          </button>
          {links.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              onClick={() => drawer.current?.close()}
            >
              {l.label}
            </Link>
          ))}
          <Link href={account}>Profil</Link>
          <Link href="/syarat-ketentuan">Syarat &amp; Ketentuan</Link>
          <Link href="/kebijakan-privasi">Kebijakan Privasi</Link>
        </div>
      </dialog>
      <main
        className="fashion-main"
        data-home={path === "/"}
        data-browsing={browse}
        data-account={accountArea}
      >
        {accountArea && signedIn && (
          <aside className="fashion-account-nav" aria-label="Menu akun">
            {[
              ["Profil saya", "/account", UserRound],
              ["Pesanan saya", "/orders", Package],
              ["Alamat pengiriman", "/account/addresses", MapPin],
              ["Wishlist", "/wishlist", Heart],
              ["Keamanan akun", "/account/security", LockKeyhole],
              ["Bantuan toko", "/account/help", CircleHelp],
            ].map(([label, href, IconValue]) => {
              const Icon = IconValue as typeof Heart;
              return (
                <Link
                  key={String(href)}
                  href={String(href)}
                  aria-current={path === href ? "page" : undefined}
                >
                  <Icon size={19} />
                  {String(label)}
                </Link>
              );
            })}
          </aside>
        )}
        <div className="fashion-content">{children}</div>
      </main>
      {browse && (
        <nav className="fashion-bottom" aria-label="Navigasi toko">
          {nav.map(({ label, href, Icon }) => (
            <Link
              key={label}
              href={href}
              aria-current={
                path === href ||
                (label === "Profil" && accountArea) ||
                (label === "Search" && path === "/shop")
                  ? "page"
                  : undefined
              }
            >
              <span>
                <Icon />
                {label === "Keranjang" && badge}
              </span>
              {label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
