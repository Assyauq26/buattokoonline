"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MissingPage({ fashion }: { fashion: boolean }) {
  const pathname = usePathname();
  const admin = /^\/admin(?:\/|$)/.test(pathname);
  const dark = fashion && !admin;
  return (
    <section
      style={{
        minHeight: "75svh",
        background: dark ? "#191817" : undefined,
        color: dark ? "#faf9f6" : undefined,
        display: "grid",
        placeContent: "center",
        gap: 18,
        padding: 24,
      }}
    >
      <h1
        style={{
          fontFamily: dark ? "Georgia, serif" : undefined,
          fontSize: "2rem",
        }}
      >
        Halaman tidak ditemukan
      </h1>
      <Link className="underline" href={admin ? "/admin" : "/shop"}>
        {admin ? "Kembali ke dashboard" : "Kembali ke katalog"}
      </Link>
    </section>
  );
}
