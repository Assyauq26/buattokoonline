"use client";

import React from "react";
import type { StoreAppearanceV1 } from "@/modules/appearance/schema";
import {
  DiamondQualityIcon,
  ShieldSecurityIcon,
  FastDeliveryIcon,
  SupportHeadsetIcon,
} from "./icons";
import { Star, RefreshCw } from "lucide-react";

function renderTrustIcon(icon: string) {
  switch (icon) {
    case "diamond":
      return <DiamondQualityIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#D9AC61]" />;
    case "shield":
      return <ShieldSecurityIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#D9AC61]" />;
    case "truck":
      return <FastDeliveryIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#D9AC61]" />;
    case "headset":
      return <SupportHeadsetIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#D9AC61]" />;
    case "star":
      return <Star className="w-5 h-5 sm:w-6 sm:h-6 text-[#D9AC61]" />;
    case "refresh":
      return <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6 text-[#D9AC61]" />;
    default:
      return <DiamondQualityIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#D9AC61]" />;
  }
}

export function DarkJeansTrustNewsletter({
  config,
}: {
  config?: StoreAppearanceV1;
}) {
  const trustCfg = config?.darkJeans?.trustFeatures;
  const isEnabled = trustCfg?.enabled ?? (config?.footer?.trustFeatures !== false);

  if (!isEnabled) {
    return null;
  }

  const items = trustCfg?.items && trustCfg.items.length > 0
    ? trustCfg.items.filter((i) => i.visible)
    : [
        { id: "t-1", icon: "diamond", title: "Premium Quality", description: "Kualitas terbaik" },
        { id: "t-2", icon: "shield", title: "Secure Payment", description: "Transaksi aman" },
        { id: "t-3", icon: "truck", title: "Fast Delivery", description: "Pengiriman cepat" },
        { id: "t-4", icon: "headset", title: "24/7 Support", description: "Bantuan pelanggan" },
      ];

  const signature = trustCfg?.signature ?? "Streetwear Denim Style";

  return (
    <section className="w-full py-4 sm:py-8 bg-[#080808]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* ONE UNIFIED HORIZONTAL PANEL */}
        <div className="bg-[#111111] border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col lg:flex-row items-center justify-between gap-6">
          
          {/* Trust items in horizontal bar */}
          <div className="w-full lg:w-auto flex-1 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/5 gap-3 sm:gap-0">
            {items.map((item, idx) => (
              <div
                key={item.id || idx}
                className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-2 sm:gap-3 sm:px-4 py-2"
              >
                <div className="shrink-0 flex items-center justify-center">
                  {renderTrustIcon(item.icon)}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs sm:text-sm font-bold text-white tracking-wide">
                    {item.title}
                  </span>
                  {item.description && (
                    <span className="text-[10px] sm:text-xs text-zinc-400 mt-0.5 hidden sm:block">
                      {item.description}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Decorative Signature (Right Side) */}
          {signature && (
            <div className="shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 pt-3 lg:pt-0 lg:pl-6 text-center lg:text-right">
              <span className="dj-cursive-script block select-none text-xl sm:text-2xl text-[#D9AC61]">
                {signature}
              </span>
            </div>
          )}

        </div>
      </div>
    </section>
  );
}
