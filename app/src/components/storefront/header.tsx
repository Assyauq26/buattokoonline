"use client";

import { useAppearance, StoreLogo } from "@/components/appearance/context";
import { useEffect, useState } from "react";
import Link from "@/components/ui/navigation";
import { Heart, ShoppingCart, User } from "lucide-react";
import type { AuthUserBasic } from "@/lib/auth/session";
import { SearchBar } from "./search-bar";
import { CART_COUNT_EVENT } from "@/modules/cart/cart-events";



export function StorefrontHeader({
  user,
  cartCount: count = 0,
}: {
  user: AuthUserBasic | null;
  cartCount?: number;
}) {
  const { config, preview } = useAppearance();
  const navLinks = config.header.links.filter(l => l.visible);
  const [liveCount, setLiveCount] = useState(count);

  useEffect(() => {
    setLiveCount(count);
  }, [count]);

  useEffect(() => {
    const onCartCount = (event: Event) => {
      const detail = (event as CustomEvent<number | { delta: number }>).detail;
      setLiveCount((current) =>
        typeof detail === "number"
          ? Math.max(0, detail)
          : Math.max(0, current + detail.delta),
      );
    };
    window.addEventListener(CART_COUNT_EVENT, onCartCount);
    return () => window.removeEventListener(CART_COUNT_EVENT, onCartCount);
  }, []);

  return (
    <header data-logo-position={config.identity.position} data-layout={config.header.layout} className={`${config.header.sticky ? "sticky top-0" : "relative"} z-30 bg-white/95 backdrop-blur`}>
      {config.header.announcement && <p className="px-4 py-2 text-center text-sm">{config.header.announcement}</p>}
      <div className="container flex items-center gap-4 py-3">
        <Link prefetch={preview ? false : undefined} href="/" className="font-display text-2xl font-extrabold tracking-tight" data-testid="logo" title={config.identity.name} aria-label={config.identity.name}>
          <StoreLogo />
        </Link>

        <nav className="ml-4 hidden items-center gap-6 lg:flex">
          {navLinks.map((l, i) => (
            <Link prefetch={preview ? false : undefined} key={i} href={l.href} className="text-sm font-semibold text-ink-soft transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>

        <div hidden={!config.header.search} className="hidden flex-1 md:block">
          {config.header.search && <SearchBar readOnlyPreview={preview} />}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Link prefetch={preview ? false : undefined} hidden={!config.header.wishlist} href="/wishlist" aria-label="Wishlist" data-testid="header-wishlist" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface">
            <Heart size={20} />
          </Link>
          <Link prefetch={preview ? false : undefined} href="/cart" aria-label="Keranjang" data-testid="header-cart" className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface">
            <ShoppingCart size={20} />
            {liveCount > 0 && (
              <span data-testid="header-cart-count" className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {liveCount}
              </span>
            )}
          </Link>
          <Link prefetch={preview ? false : undefined} href={user ? "/account" : "/login"} data-testid="header-account" className="flex min-h-11 items-center gap-2 rounded-full px-2 py-1.5 hover:bg-surface">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface">
              <User size={18} />
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-semibold text-ink">{user ? user.name.split(" ")[0] : "Masuk"}</span>
              <span className="block text-[11px] text-ink-muted">Akun Saya</span>
            </span>
          </Link>
        </div>
      </div>

      <div hidden={!config.header.search} className="container pb-3 md:hidden">
        {config.header.search && <SearchBar readOnlyPreview={preview} />}
      </div>
    </header>
  );
}
