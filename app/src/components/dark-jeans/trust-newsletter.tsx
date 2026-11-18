"use client";

import React from "react";
import type { AppearanceConfig } from "@/modules/appearance/schema";
import {
  DiamondQualityIcon,
  ShieldSecurityIcon,
  FastDeliveryIcon,
  SupportHeadsetIcon,
} from "./icons";

const TRUST_ITEMS = [
  {
    Icon: DiamondQualityIcon,
    title: "Premium Quality",
    desc: "Kualitas bahan denim premium",
  },
  {
    Icon: ShieldSecurityIcon,
    title: "Secure Payment",
    desc: "Transaksi 100% aman dan terenkripsi",
  },
  {
    Icon: FastDeliveryIcon,
    title: "Fast Delivery",
    desc: "Pengiriman cepat ke seluruh Indonesia",
  },
  {
    Icon: SupportHeadsetIcon,
    title: "24/7 Support",
    desc: "Layanan bantuan pelanggan siap sedia",
  },
];

export function DarkJeansTrustNewsletter({
  config,
}: {
  config?: AppearanceConfig;
}) {
  const showTrust = config?.footer?.trustFeatures !== false;

  if (!showTrust) {
    return null;
  }

  return (
    <section className="w-full py-12 lg:py-16 bg-[#0B0B0E] border-t border-white/5 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* 4 Trust Pillars */}
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {TRUST_ITEMS.map((item, idx) => (
              <div
                key={idx}
                className="dj-trust-card flex flex-col items-center text-center gap-2.5 p-4 rounded-xl bg-[#121318] border border-white/5 hover:border-[#E5A93C]/30 transition-all"
              >
                <div className="w-10 h-10 flex items-center justify-center">
                  <item.Icon className="w-8 h-8" />
                </div>
                <span className="text-xs font-semibold text-zinc-200">
                  {item.title}
                </span>
                <span className="text-[10px] text-zinc-500 leading-tight hidden sm:block">
                  {item.desc}
                </span>
              </div>
            ))}
          </div>

          {/* Right Side: Brand Statement & Gold Cursive Script (Rule 12 Compliant) */}
          <div className="lg:col-span-4 flex items-center justify-center lg:justify-end py-2">
            <div className="flex flex-col items-center lg:items-end text-center lg:text-right">
              <span className="text-xs uppercase tracking-[0.25em] text-zinc-500 font-mono mb-1">
                Authentic Denim Co.
              </span>
              <span className="dj-cursive-script select-none">
                Streetwear Denim Style
              </span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
