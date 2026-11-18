"use client";

import React, { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
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
  },
  {
    Icon: ShieldSecurityIcon,
    title: "Secure Payment",
  },
  {
    Icon: FastDeliveryIcon,
    title: "Fast Delivery",
  },
  {
    Icon: SupportHeadsetIcon,
    title: "24/7 Support",
  },
];

export function DarkJeansTrustNewsletter() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) return;
    setSubscribed(true);
    setTimeout(() => {
      setEmail("");
      setSubscribed(false);
    }, 3000);
  };

  return (
    <section className="w-full py-12 lg:py-16 bg-[#0B0B0E] border-t border-white/5 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          
          {/* Left Side: 4 Trust Pillars */}
          <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
            {TRUST_ITEMS.map((item, idx) => (
              <div key={idx} className="dj-trust-card flex flex-col items-center text-center gap-2.5">
                <div className="w-10 h-10 flex items-center justify-center">
                  <item.Icon className="w-8 h-8" />
                </div>
                <span className="text-xs font-semibold text-zinc-300">
                  {item.title}
                </span>
              </div>
            ))}
          </div>

          {/* Right Side: Newsletter Box + Cursive Script */}
          <div className="lg:col-span-7 flex flex-col md:flex-row items-center justify-between gap-6 bg-[#13151D] border border-white/10 rounded-2xl p-6 sm:p-8">
            <div className="space-y-2 flex-1 max-w-sm">
              <h3 className="text-base sm:text-lg font-bold text-white uppercase tracking-wide">
                Join Our Newsletter
              </h3>
              <p className="text-xs text-zinc-400">
                Dapatkan info terbaru, promo menarik dan koleksi eksklusif dari street.id.
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2">
                <input
                  type="email"
                  placeholder="Masukkan email kamu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-[#0B0B0E] border border-white/10 rounded-full px-4 py-2 text-xs text-white placeholder-zinc-500 w-full outline-none focus:border-[#E5A93C] transition-colors"
                  required
                />
                <button
                  type="submit"
                  className="dj-icon-btn !bg-[#E5A93C] !text-[#0B0B0E] !border-[#E5A93C] shrink-0 hover:brightness-110"
                  aria-label="Langganan newsletter"
                >
                  {subscribed ? (
                    <Check size={16} strokeWidth={2.5} />
                  ) : (
                    <ArrowUpRight size={16} strokeWidth={2.5} />
                  )}
                </button>
              </form>
            </div>

            {/* Cursive Signature Script */}
            <div className="hidden sm:block shrink-0 pl-2">
              <span className="dj-cursive-script select-none block">
                Streetwear<br />Denim Style
              </span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
