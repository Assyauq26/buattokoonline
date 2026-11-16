"use client";
import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
export function FashionSearch({
  value = "",
  wishlist = false,
}: {
  value?: string;
  wishlist?: boolean;
}) {
  const [query, setQuery] = useState(value),
    [results, setResults] = useState<{ slug: string; name: string }[]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    setResults([]);
    setStatus("");
    if (wishlist || !query.trim() || query.trim() === value.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("Mencari…");
      try {
        const r = await fetch(
          "/api/v1/search?q=" + encodeURIComponent(query.trim()),
          { signal: controller.signal },
        );
        if (!r.ok) throw Error();
        const body = await r.json();
        if (controller.signal.aborted) return;
        setResults(body.data.products);
        setStatus(body.data.products.length ? "" : "Produk tidak ditemukan.");
      } catch {
        if (!controller.signal.aborted)
          setStatus("Saran belum dapat dimuat. Tekan Enter untuk mencari.");
      }
    }, 240);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, value, wishlist]);
  const label = wishlist ? "Cari wishlist" : "Cari produk";
  return (
    <div>
      <form
        role="search"
        className="fashion-search"
        action={wishlist ? "/wishlist" : "/search"}
      >
        <button aria-label={label}>
          <Search size={19} />
        </button>
        <input
          name="q"
          maxLength={160}
          placeholder={label}
          aria-label={label}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      {status && <p role="status">{status}</p>}
      {results.length > 0 && (
        <ul className="mb-5 border-b pb-2">
          {results.map((p) => (
            <li key={p.slug}>
              <Link
                className="block py-2"
                href={"/product/" + encodeURIComponent(p.slug)}
              >
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
