"use client";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
export function PayOrderLink({
  orderId,
  correction = false,
}: {
  orderId: string;
  correction?: boolean;
}) {
  const [pending, start] = useTransition(),
    router = useRouter(),
    href = `/checkout/payment/${encodeURIComponent(orderId)}`;
  return (
    <Link
      href={href}
      className="primary"
      aria-disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (!pending) start(() => router.push(href));
      }}
    >
      {pending && <LoaderCircle size={16} className="animate-spin" />}
      {pending
        ? "Memuat pembayaran…"
        : correction
          ? "Perbaiki bukti"
          : "Bayar sekarang"}
    </Link>
  );
}
