"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search,
  ShoppingBag,
  UserRound,
  Menu,
  X,
  Truck,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import {
  StreetIdLogo,
  TikTokIcon,
  InstagramIcon,
  YouTubeIcon,
  StoreFrontIcon,
} from "./icons";
import { StoreLogo, useAppearance } from "@/components/appearance/context";
import { CART_COUNT_EVENT } from "@/modules/cart/cart-events";

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
  const path = preview ? "/" : pathname;
  const router = useRouter();
  const [units, setUnits] = useState(count);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  };

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Shop", href: "/shop", hasDropdown: true },
    { label: "Collection", href: "/shop" },
    { label: "About", href: "/account/help" },
    { label: "Contact", href: "/account/help" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#0B0B0E] text-white">
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="dj-announcement">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 px-4">
          {/* Left value tags */}
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 text-xs font-medium">
            <span className="dj-announcement-item">
              <Truck size={14} className="text-[#E5A93C]" />
              Gratis Ongkir Min. 200K
            </span>
            <span className="dj-announcement-item">
              <ShieldCheck size={14} className="text-[#E5A93C]" />
              100% Original Product
            </span>
            <span className="dj-announcement-item">
              <RefreshCw size={14} className="text-[#E5A93C]" />
              Mudah Return
            </span>
          </div>

          {/* Right social media links */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[#9E9E9E]">Follow Us :</span>
            <div className="flex items-center gap-2.5 text-white/80">
              <a
                href="https://tiktok.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#E5A93C] transition-colors"
                aria-label="TikTok"
              >
                <TikTokIcon className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#E5A93C] transition-colors"
                aria-label="Instagram"
              >
                <InstagramIcon className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#E5A93C] transition-colors"
                aria-label="YouTube"
              >
                <YouTubeIcon className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN HEADER / NAVIGATION */}
      <header className="dj-header">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 py-3 md:py-4">
          {/* Mobile menu toggle */}
          <button
            type="button"
            className="md:hidden dj-icon-btn"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Buka menu"
          >
            <Menu size={20} />
          </button>

          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            {config?.identity?.logoAssetId ? (
              <StoreLogo />
            ) : (
              <StreetIdLogo />
            )}
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            {navLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`dj-nav-link flex items-center gap-1 ${
                  path === item.href ? "active" : ""
                }`}
              >
                {item.label}
                {item.hasDropdown && (
                  <ChevronDown size={14} className="opacity-60" />
                )}
              </Link>
            ))}
          </nav>

          {/* Right Header Controls: Search, User, Cart */}
          <div className="flex items-center gap-2.5 md:gap-4">
            {/* Search Pill Input */}
            <form onSubmit={handleSearch} className="hidden sm:flex dj-search-pill items-center gap-2 w-44 md:w-56">
              <input
                type="text"
                placeholder="Cari produk..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-xs w-full text-white placeholder-zinc-500"
              />
              <button type="submit" aria-label="Cari" className="text-zinc-400 hover:text-[#E5A93C] transition-colors">
                <Search size={15} />
              </button>
            </form>

            {/* Profile link */}
            <Link
              href={accountHref}
              className="dj-icon-btn"
              aria-label="Akun saya"
            >
              <UserRound size={18} />
            </Link>

            {/* Shopping cart with badge */}
            <Link
              href="/cart"
              className="dj-icon-btn relative"
              aria-label={`Keranjang belanja, ${units} item`}
            >
              <ShoppingBag size={18} />
              {units > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[1.2rem] h-[1.2rem] px-1 rounded-full text-[10px] font-bold bg-[#E5A93C] text-[#0B0B0E] border border-[#0B0B0E] shadow">
                  {units}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-4/5 max-w-sm bg-[#121318] border-r border-zinc-800 p-6 flex flex-col justify-between z-10 animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between pb-6 border-b border-zinc-800">
                <StreetIdLogo size={36} />
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="dj-icon-btn"
                  aria-label="Tutup menu"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Mobile Search */}
              <form onSubmit={handleSearch} className="mt-6 flex dj-search-pill items-center gap-2">
                <input
                  type="text"
                  placeholder="Cari produk..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs w-full text-white placeholder-zinc-500"
                />
                <button type="submit" aria-label="Cari" className="text-zinc-400">
                  <Search size={15} />
                </button>
              </form>

              {/* Mobile Nav Links */}
              <div className="flex flex-col gap-4 mt-6">
                {navLinks.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-base font-semibold text-zinc-300 hover:text-[#E5A93C] transition-colors py-1"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800 text-xs text-zinc-500">
              <p>© 2025 street.id. All rights reserved.</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. MAIN CONTENT CONTAINER */}
      <main className="flex-1 w-full">{children}</main>

      {/* 4. FOOTER (Matching mockup 4 columns + copyright) */}
      <footer className="bg-[#08080A] border-t border-white/10 pt-14 pb-8">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8 pb-12">
          {/* Column 1: Brand & Socials */}
          <div className="flex flex-col gap-4">
            <Link href="/">
              <StreetIdLogo size={42} />
            </Link>
            <p className="text-xs text-zinc-400 max-w-xs mt-1">
              More Than Just Jeans.
            </p>
            <div className="flex items-center gap-3 mt-2 text-zinc-400">
              <a
                href="https://tiktok.com"
                target="_blank"
                rel="noreferrer"
                className="dj-icon-btn !w-9 !h-9 text-zinc-300 hover:text-[#E5A93C]"
                aria-label="TikTok"
              >
                <TikTokIcon className="w-4 h-4" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="dj-icon-btn !w-9 !h-9 text-zinc-300 hover:text-[#E5A93C]"
                aria-label="Instagram"
              >
                <InstagramIcon className="w-4 h-4" />
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noreferrer"
                className="dj-icon-btn !w-9 !h-9 text-zinc-300 hover:text-[#E5A93C]"
                aria-label="YouTube"
              >
                <YouTubeIcon className="w-4 h-4" />
              </a>
              <a
                href="/shop"
                className="dj-icon-btn !w-9 !h-9 text-zinc-300 hover:text-[#E5A93C]"
                aria-label="Store"
              >
                <StoreFrontIcon className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Column 2: Quick Link */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-bold tracking-wider text-white uppercase">
              Quick Link
            </h4>
            <ul className="flex flex-col gap-2 text-xs text-zinc-400 font-medium">
              <li>
                <Link href="/" className="hover:text-white transition-colors">Home</Link>
              </li>
              <li>
                <Link href="/shop" className="hover:text-white transition-colors">Shop</Link>
              </li>
              <li>
                <Link href="/shop" className="hover:text-white transition-colors">Collection</Link>
              </li>
              <li>
                <Link href="/account/help" className="hover:text-white transition-colors">About</Link>
              </li>
              <li>
                <Link href="/account/help" className="hover:text-white transition-colors">Contact</Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Customer Care */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-bold tracking-wider text-white uppercase">
              Customer Care
            </h4>
            <ul className="flex flex-col gap-2 text-xs text-zinc-400 font-medium">
              <li>
                <Link href="/account/help" className="hover:text-white transition-colors">Cara Belanja</Link>
              </li>
              <li>
                <Link href="/account/help" className="hover:text-white transition-colors">Pengiriman</Link>
              </li>
              <li>
                <Link href="/account/help" className="hover:text-white transition-colors">Pembayaran</Link>
              </li>
              <li>
                <Link href="/account/help" className="hover:text-white transition-colors">Retur &amp; Refund</Link>
              </li>
              <li>
                <Link href="/account/help" className="hover:text-white transition-colors">FAQ</Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Our Store */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-bold tracking-wider text-white uppercase">
              Our Store
            </h4>
            <div className="text-xs text-zinc-400 leading-relaxed">
              <p className="text-white font-semibold">street.id Pekalongan</p>
              <p>Jl. Veteran No.123, Pekalongan</p>
            </div>
          </div>
        </div>

        {/* Copyright Bar */}
        <div className="border-t border-white/5 pt-6 text-center text-xs text-zinc-500">
          <p>© 2025 street.id. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
