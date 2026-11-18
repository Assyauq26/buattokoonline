"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  ShoppingBag,
  UserRound,
  Menu,
  X,
  Truck,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Tag,
  Star,
  Heart,
  ChevronDown,
} from "lucide-react";
import {
  TikTokIcon,
  InstagramIcon,
  YouTubeIcon,
  StoreFrontIcon,
} from "./icons";
import { StoreLogo, useAppearance } from "@/components/appearance/context";
import { CART_COUNT_EVENT } from "@/modules/cart/cart-events";

function renderAnnouncementIcon(icon?: string) {
  switch (icon) {
    case "shield":
      return <ShieldCheck size={14} className="shrink-0 text-[#D9AC61]" />;
    case "refresh":
      return <RefreshCw size={14} className="shrink-0 text-[#D9AC61]" />;
    case "sparkles":
      return <Sparkles size={14} className="shrink-0 text-[#D9AC61]" />;
    case "star":
      return <Star size={14} className="shrink-0 text-[#D9AC61]" />;
    case "tag":
      return <Tag size={14} className="shrink-0 text-[#D9AC61]" />;
    case "truck":
    default:
      return <Truck size={14} className="shrink-0 text-[#D9AC61]" />;
  }
}

export function DarkJeansShell({
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
  const searchParams = useSearchParams();
  const path = preview ? "/" : pathname;
  const router = useRouter();

  const [units, setUnits] = useState(count);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const accountHref = signedIn ? "/account" : "/login?redirectTo=/account";

  useEffect(() => setUnits(count), [count]);
  useEffect(() => {
    const handleCartUpdate = (e: Event) => {
      const detail = (e as CustomEvent<number | { delta: number }>).detail;
      setUnits((prev) =>
        Math.max(0, typeof detail === "number" ? detail : prev + detail.delta)
      );
    };
    window.addEventListener(CART_COUNT_EVENT, handleCartUpdate);
    return () => window.removeEventListener(CART_COUNT_EVENT, handleCartUpdate);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/shop?q=${encodeURIComponent(searchQuery.trim())}`);
    setMobileSearchOpen(false);
  };

  // Nav links: Use native Hubify routes
  const configuredLinks = config?.header?.links?.filter((l) => l.visible);
  const navLinks =
    configuredLinks && configuredLinks.length > 0
      ? configuredLinks.map((l) => ({
          id: l.id,
          label: l.label,
          href: l.href,
        }))
      : [
          { id: "home", label: "Home", href: "/" },
          { id: "shop", label: "Shop", href: "/shop" },
          { id: "category", label: "Kategori", href: "/shop" },
          { id: "brand", label: "Brand", href: "/shop" },
          { id: "promo", label: "Promo", href: "/shop?flash=1" },
        ];

  // Deterministic active nav resolution (only ONE menu active at a time)
  function isLinkActive(item: { id: string; href: string }) {
    if (preview) return item.id === "home";

    const isFlashQuery = searchParams?.get("flash") === "1";
    if (item.id === "promo" || item.href.includes("flash=1")) {
      return pathname === "/shop" && isFlashQuery;
    }

    if (item.id === "shop" && pathname === "/shop") {
      return !isFlashQuery && !searchParams?.get("category") && !searchParams?.get("brand");
    }

    if (item.id === "home" && pathname === "/") {
      return true;
    }

    if (item.href === pathname) {
      return true;
    }

    return false;
  }

  // Structured announcement items
  const djAnnouncementItems = config?.darkJeans?.announcementItems?.filter((i) => i.visible);
  const rawAnnouncement = config?.header?.announcement?.trim();
  const announcementItems =
    djAnnouncementItems && djAnnouncementItems.length > 0
      ? djAnnouncementItems
      : rawAnnouncement
      ? rawAnnouncement
          .split("|")
          .map((s, idx) => ({
            id: `ann-${idx}`,
            label: s.trim(),
            icon: idx === 1 ? "shield" : idx === 2 ? "refresh" : "truck",
            visible: true,
            order: idx,
          }))
          .filter((i) => i.label.length > 0)
      : preview
      ? [
          { id: "p-1", label: "Gratis Ongkir Min. 200K", icon: "truck", visible: true, order: 0 },
          { id: "p-2", label: "100% Original Product", icon: "shield", visible: true, order: 1 },
          { id: "p-3", label: "Mudah Return", icon: "refresh", visible: true, order: 2 },
        ]
      : [];

  // Social media configuration
  const socialLinks = config?.darkJeans?.socialLinks?.filter(
    (s) => s.enabled && s.url && s.url.trim().length > 0
  ) || [];
  const headerSocials = socialLinks.filter((s) => s.headerVisible);
  const footerSocials = socialLinks.filter((s) => s.footerVisible);

  const storeName = config?.identity?.name || "Toko Anda";
  const storeTagline = config?.identity?.tagline || config?.footer?.tagline || "";
  const storeAddress = config?.identity?.operationalAddress || "";

  const isHomepage = path === "/";

  // Footer links
  const footerConfig = config?.darkJeans?.footer;
  const quickLinksTitle = footerConfig?.quickLinksTitle || "Quick Link";
  const customerCareTitle = footerConfig?.customerCareTitle || "Customer Care";
  const quickLinks =
    footerConfig?.quickLinks && footerConfig.quickLinks.length > 0
      ? footerConfig.quickLinks.filter((l) => l.visible)
      : [
          { id: "ql-1", label: "Home", href: "/" },
          { id: "ql-2", label: "Shop", href: "/shop" },
          { id: "ql-3", label: "Kategori", href: "/shop" },
          { id: "ql-4", label: "Brand", href: "/shop" },
          { id: "ql-5", label: "Promo", href: "/shop?flash=1" },
        ];
  const customerCareLinks =
    footerConfig?.customerCare && footerConfig.customerCare.length > 0
      ? footerConfig.customerCare.filter((l) => l.visible)
      : [
          { id: "cc-1", label: "Cara Belanja", href: "/account/help" },
          { id: "cc-2", label: "Pengiriman", href: "/account/help" },
          { id: "cc-3", label: "Pembayaran", href: "/account/help" },
          { id: "cc-4", label: "Retur & Refund", href: "/account/help" },
          { id: "cc-5", label: "FAQ", href: "/account/help" },
        ];

  return (
    <div className="flex flex-col min-h-screen bg-[#080808] text-white selection:bg-[#D9AC61] selection:text-[#080808]">
      
      {/* 1. TOP ANNOUNCEMENT BAR (Normal flow, scrolls away naturally) */}
      {announcementItems.length > 0 && (
        <div className="dj-announcement w-full bg-[#080808] border-b border-white/5 py-2 px-3 sm:px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            {/* Horizontal single row: scrolls smoothly on mobile, no multi-row wrapping */}
            <div className="flex items-center gap-3 sm:gap-6 overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap text-xs text-zinc-300">
              {announcementItems.map((item, idx) => (
                <React.Fragment key={item.id || idx}>
                  {idx > 0 && <span className="text-zinc-600 hidden sm:inline">|</span>}
                  <div className="inline-flex items-center gap-1.5 shrink-0">
                    {renderAnnouncementIcon(item.icon)}
                    <span className="font-medium">{item.label}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* Desktop-only social links */}
            {headerSocials.length > 0 && (
              <div className="hidden md:flex items-center gap-3 shrink-0 text-xs text-zinc-400">
                <span>Follow Us :</span>
                <div className="flex items-center gap-2.5 text-zinc-300">
                  {headerSocials.map((s) => (
                    <a
                      key={s.platform}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-[#D9AC61] transition-colors"
                      aria-label={s.platform}
                    >
                      {s.platform === "tiktok" && <TikTokIcon className="w-3.5 h-3.5" />}
                      {s.platform === "instagram" && <InstagramIcon className="w-3.5 h-3.5" />}
                      {s.platform === "youtube" && <YouTubeIcon className="w-3.5 h-3.5" />}
                      {s.platform === "facebook" && <span className="text-xs font-bold">f</span>}
                      {s.platform === "whatsapp" && <span className="text-xs font-bold">WA</span>}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. STICKY MAIN HEADER ONLY (Sticky at top: 0) */}
      <header className="dj-header sticky top-0 z-50 bg-[#080808]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 lg:px-8 py-3 md:py-4">
          
          {/* MOBILE LEFT: Hamburger Menu Toggle */}
          <button
            type="button"
            className="md:hidden dj-icon-btn !w-9 !h-9 text-zinc-300"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Buka navigasi menu"
          >
            <Menu size={18} />
          </button>

          {/* STORE LOGO / BRAND (Left on Desktop, Centered independently on Mobile) */}
          <div className="flex items-center md:justify-start justify-center flex-1 md:flex-initial">
            <Link href="/" className="flex items-center gap-2 group">
              {config?.identity?.logoAssetId ? (
                <StoreLogo />
              ) : (
                <div className="flex flex-col leading-none">
                  <span className="font-black italic tracking-wide text-white text-lg md:text-xl font-display">
                    {storeName}
                  </span>
                  {storeTagline && (
                    <span className="text-[8px] md:text-[9px] tracking-[0.2em] text-[#A0A0A0] uppercase font-bold mt-0.5 line-clamp-1">
                      {storeTagline}
                    </span>
                  )}
                </div>
              )}
            </Link>
          </div>

          {/* DESKTOP CENTER: Native Navigation Menus */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            {navLinks.map((item) => {
              const active = isLinkActive(item);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`dj-nav-link text-sm font-medium transition-colors relative py-1 ${
                    active ? "text-white active" : "text-zinc-300 hover:text-white"
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D9AC61] rounded-full shadow-[0_0_8px_#D9AC61]" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* RIGHT ACTION CONTROLS */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Desktop Pill Search Bar */}
            <form
              onSubmit={handleSearch}
              className="hidden md:flex dj-search-pill items-center gap-2 w-48 lg:w-56"
            >
              <input
                type="text"
                placeholder="Cari produk..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-xs w-full text-white placeholder-zinc-500"
              />
              <button
                type="submit"
                aria-label="Cari"
                className="text-zinc-400 hover:text-[#D9AC61] transition-colors"
              >
                <Search size={15} />
              </button>
            </form>

            {/* Mobile Search Toggle Button */}
            <button
              type="button"
              className="md:hidden dj-icon-btn !w-9 !h-9 text-zinc-300"
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              aria-label="Cari produk"
            >
              <Search size={17} />
            </button>

            {/* Customer Account Button */}
            <Link
              href={accountHref}
              className="dj-icon-btn !w-9 !h-9 text-zinc-300"
              aria-label="Akun saya"
            >
              <UserRound size={17} />
            </Link>

            {/* Shopping Cart Button with numeric Gold Badge */}
            <Link
              href="/cart"
              className="dj-icon-btn !w-9 !h-9 relative text-zinc-300"
              aria-label={`Keranjang belanja, ${units} item`}
            >
              <ShoppingBag size={17} />
              {units > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full text-[10px] font-black bg-[#D9AC61] text-[#080808] border border-[#080808] shadow">
                  {units}
                </span>
              )}
            </Link>
          </div>

        </div>

        {/* MOBILE EXPANDABLE SEARCH OVERLAY */}
        {mobileSearchOpen && (
          <div className="md:hidden border-t border-white/10 p-3 bg-[#111111] animate-in slide-in-from-top-2 duration-150">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Cari produk di toko..."
                value={searchQuery}
                autoFocus
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-[#161616] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D9AC61]"
              />
              <button
                type="submit"
                className="dj-btn-pill !text-xs !py-2 !px-4"
              >
                Cari
              </button>
              <button
                type="button"
                onClick={() => setMobileSearchOpen(false)}
                className="p-2 text-zinc-400 hover:text-white"
                aria-label="Tutup pencarian"
              >
                <X size={18} />
              </button>
            </form>
          </div>
        )}
      </header>

      {/* MOBILE DRAWER NAVIGATION */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-4/5 max-w-sm bg-[#111111] border-r border-zinc-800 p-6 flex flex-col justify-between z-10 animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <span className="font-bold text-white text-base">
                  {storeName}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-zinc-400 hover:text-white"
                  aria-label="Tutup menu"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Navigation list */}
              <nav className="flex flex-col gap-1 py-4">
                {navLinks.map((item) => {
                  const active = isLinkActive(item);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-white/10 text-[#D9AC61] font-semibold"
                          : "text-zinc-300 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span>{item.label}</span>
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-[#D9AC61]" />}
                    </Link>
                  );
                })}
                {config?.header?.wishlist && (
                  <Link
                    href="/wishlist"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5"
                  >
                    <Heart size={16} />
                    <span>Wishlist Saya</span>
                  </Link>
                )}
              </nav>
            </div>

            {/* Drawer footer */}
            <div className="pt-4 border-t border-zinc-800 text-xs text-zinc-500">
              <p>© {new Date().getFullYear()} {storeName}.</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. MAIN CONTENT CONTAINER (Full-bleed on homepage, standard container on internal pages) */}
      <main className="flex-1 w-full">
        {isHomepage ? (
          children
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 min-h-[60vh]">
            {children}
          </div>
        )}
      </main>

      {/* 4. FOOTER (Matching Mockup 4 Compact Columns + Copyright) */}
      <footer className="bg-[#080808] border-t border-white/10 pt-10 pb-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 pb-10">
          
          {/* Column 1: Store Brand & Socials */}
          <div className="flex flex-col gap-3">
            <Link href="/" className="inline-block">
              {config?.identity?.logoAssetId ? (
                <StoreLogo />
              ) : (
                <span className="font-black italic text-lg text-white font-display">
                  {storeName}
                </span>
              )}
            </Link>
            {storeTagline && (
              <p className="text-xs text-zinc-400 max-w-xs">
                {storeTagline}
              </p>
            )}
            {footerSocials.length > 0 && (
              <div className="flex items-center gap-2.5 mt-2 text-zinc-400">
                {footerSocials.map((s) => (
                  <a
                    key={s.platform}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="dj-icon-btn !w-8 !h-8 text-zinc-300 hover:text-[#D9AC61]"
                    aria-label={s.platform}
                  >
                    {s.platform === "tiktok" && <TikTokIcon className="w-3.5 h-3.5" />}
                    {s.platform === "instagram" && <InstagramIcon className="w-3.5 h-3.5" />}
                    {s.platform === "youtube" && <YouTubeIcon className="w-3.5 h-3.5" />}
                    {s.platform === "facebook" && <span className="text-xs font-bold">f</span>}
                    {s.platform === "whatsapp" && <span className="text-xs font-bold">WA</span>}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: Quick Links */}
          <div className="flex flex-col gap-2.5">
            <h4 className="text-xs font-bold tracking-wider text-white uppercase font-display">
              {quickLinksTitle}
            </h4>
            <ul className="flex flex-col gap-1.5 text-xs text-zinc-400">
              {quickLinks.map((l) => (
                <li key={l.id}>
                  <Link href={l.href} className="hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Customer Care */}
          <div className="flex flex-col gap-2.5">
            <h4 className="text-xs font-bold tracking-wider text-white uppercase font-display">
              {customerCareTitle}
            </h4>
            <ul className="flex flex-col gap-1.5 text-xs text-zinc-400">
              {customerCareLinks.map((l) => (
                <li key={l.id}>
                  <Link href={l.href} className="hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Our Store */}
          <div className="flex flex-col gap-2.5">
            <h4 className="text-xs font-bold tracking-wider text-white uppercase font-display">
              Our Store
            </h4>
            <div className="text-xs text-zinc-400 leading-relaxed space-y-1">
              <p className="text-white font-semibold">{storeName}</p>
              {storeAddress ? (
                <p>{storeAddress}</p>
              ) : (
                <p className="text-zinc-500 italic">Informasi toko</p>
              )}
            </div>
          </div>

        </div>

        {/* Bottom Bar: Copyright & Legal */}
        <div className="border-t border-white/5 pt-5 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <p>© {new Date().getFullYear()} {storeName}. All rights reserved.</p>
          <div className="flex items-center gap-4 text-zinc-500 text-[11px]">
            <Link href="/syarat-ketentuan" className="hover:text-zinc-300">
              Syarat &amp; Ketentuan
            </Link>
            <Link href="/kebijakan-privasi" className="hover:text-zinc-300">
              Kebijakan Privasi
            </Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
