"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, LoaderCircle } from "lucide-react";
import { useNavigation } from "@/components/ui/navigation";

export function SearchBar({ className = "", readOnlyPreview = false }: { className?: string; readOnlyPreview?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const currentQuery = params.get("q") ?? "";
  const [q, setQ] = useState(currentQuery);
  const navigation = useNavigation();
  const submitted = useRef(false);
  const pending = !!navigation?.pending && navigation.destination.startsWith("/search?");
  useEffect(() => { setQ(currentQuery); }, [currentQuery]);
  if (!pending) submitted.current = false;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnlyPreview || submitted.current) return;
    const href = `/search?q=${encodeURIComponent(q.trim())}`;
    submitted.current = true;
    if (navigation) navigation.navigate(href); else router.push(href);
  }

  return (
    <form role="search" aria-label="Pencarian katalog" aria-busy={pending} onSubmit={submit} className={`relative flex-1 ${className}`} data-testid="search-bar">
      <Search
        size={18}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"
      />
      <input
        readOnly={readOnlyPreview}
        value={q}
        aria-label="Cari katalog"
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari produk, brand, atau kategori..."
        data-testid="search-input"
        className="h-11 w-full rounded-full border border-line bg-surface pl-11 pr-12 text-sm text-ink placeholder:text-ink-muted focus:border-zinc-600 focus:outline-none focus:ring-0"
      />
      <button
        type="submit"
        aria-label={pending ? "Memuat pencarian" : "Cari"}
        disabled={pending || readOnlyPreview}
        className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-line/60 disabled:opacity-50"
      >
        {pending ? <LoaderCircle size={16} className="motion-safe:animate-spin" /> : <Search size={16} />}
      </button>
    </form>
  );
}
