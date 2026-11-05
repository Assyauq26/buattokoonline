"use client";

import { useId, useRef, useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareButton({ title, iconOnly = false }: { title: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const feedbackId = useId();
  async function share() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    setCopied(false);
    const url = window.location.href;
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch (failure) {
          // Cancelling the native sheet must not silently copy to the clipboard.
          if (failure instanceof DOMException && failure.name === "AbortError") return;
        }
      }
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Tautan belum bisa disalin. Gunakan menu Bagikan pada browser Anda.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <span className="relative inline-flex">
      <Button type="button" disabled={pending} aria-describedby={error ? feedbackId : undefined}
        variant={iconOnly ? "outline" : "ghost"} size={iconOnly ? "icon" : "sm"}
        className={iconOnly ? "pdp-header-action h-11 w-11 border-0 bg-white/90 shadow-sm backdrop-blur" : ""}
        aria-label={copied ? "Tautan produk tersalin" : "Bagikan produk"} onClick={share} data-testid="share-btn">
        {copied ? <Check size={16} /> : <Share2 size={16} />}
        {!iconOnly && (copied ? "Tersalin" : "Bagikan")}
      </Button>
      {error && <span id={feedbackId} role="status"
        className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-800 shadow-lg">
        {error}
      </span>}
    </span>
  );
}
