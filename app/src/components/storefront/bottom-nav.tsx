"use client";

import { useAppearance } from "@/components/appearance/context";
import { CORE_HREFS } from "@/modules/appearance/schema";
import { useEffect, useState } from "react";
import Link from "@/components/ui/navigation";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ShoppingBag, User, Heart, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { CART_COUNT_EVENT } from "@/modules/cart/cart-events";



export function BottomNav({ cartCount: count = 0 }: { cartCount?: number }) {
  const {config, preview} = useAppearance();
  const icons = {home:Home,shop:LayoutGrid,cart:ShoppingBag,account:User,heart:Heart,star:Star};
  const items = config.mobile.items.map(i => ({...i,href:CORE_HREFS[i.id],icon:icons[i.icon],badgeKey:i.id === "cart"}));
  const pathname = usePathname();
  const currentPath = preview ? "/" : pathname;
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
    <nav
      className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center justify-center gap-1 rounded-full bg-white/95 p-1.5 backdrop-blur transition-[background-color,box-shadow] duration-300 md:hidden motion-reduce:transition-none"
      style={{ boxShadow: config.mobile.style === "pill"
        ? "var(--store-nav-shadow, 0 10px 34px rgb(0 0 0 / .17), 0 2px 9px rgb(0 0 0 / .07))"
        : "var(--store-nav-bar-shadow, 0 -5px 24px rgb(0 0 0 / .08))" }}
      data-style={config.mobile.style}
      data-testid="bottom-nav"
    >
      {items.map((item) => {
        const active =
          item.href === "/" ? currentPath === "/" : currentPath.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link prefetch={preview ? false : undefined}
            key={item.href}
            href={item.href}
            data-testid={`bottomnav-${item.label.toLowerCase()}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold transition-[width,background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              active
                ? "w-[128px] gap-2 bg-black px-3 text-white shadow-sm"
                : "w-11 gap-0 px-0 text-ink-soft hover:bg-surface/70",
            )}
          >
            <span className="relative flex shrink-0 items-center justify-center">
              <Icon size={20} strokeWidth={active ? 2.2 : 2} />
              {item.badgeKey && liveCount > 0 && (
                <span data-testid="bottom-cart-count" className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold leading-none text-black ring-1 ring-black/10">
                  {liveCount}
                </span>
              )}
            </span>
            <span
              className={cn(
                "whitespace-nowrap overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                active
                  ? "max-w-[72px] translate-x-0 opacity-100"
                  : "pointer-events-none max-w-0 -translate-x-1 opacity-0",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
