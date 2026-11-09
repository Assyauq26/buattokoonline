"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { customerTabs } from "@/lib/customer-order-view";
export function CustomerOrderTabs({
  tab,
  q,
  counts,
}: {
  tab: string;
  q: string;
  counts: Record<string, number>;
}) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    nav.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({
        inline: "nearest",
        block: "nearest",
        behavior: "instant",
      });
  }, [tab]);
  return (
    <nav ref={nav} aria-label="Status pesanan">
      {customerTabs.map((t) => (
        <Link
          key={t.key}
          href={`/orders?tab=${t.key}&q=${encodeURIComponent(q)}`}
          aria-current={tab === t.key ? "page" : undefined}
        >
          {t.label} ({counts[t.key] || 0})
        </Link>
      ))}
    </nav>
  );
}
