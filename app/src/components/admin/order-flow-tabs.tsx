"use client";
import Link from "@/components/ui/navigation";
import { useEffect, useRef } from "react";
export function OrderFlowTabs({
  tabs,
  tab,
}: {
  tabs: { key: string; label: string; href: string; count: number }[];
  tab: string;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);
  return (
    <nav ref={root} className="simple-tabs" aria-label="Status pesanan">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={tab === t.key ? "page" : undefined}
        >
          {t.label} <span>{t.count}</span>
        </Link>
      ))}
    </nav>
  );
}
