"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  campaignState,
  type CampaignClock,
} from "@/modules/promotions/campaign.validation";
function identity(c: CampaignClock | null) {
  return c
    ? [
        c.id,
        c.version,
        c.startsAt,
        c.endsAt,
        c.status,
        campaignState(c, c.serverNow),
      ].join("|")
    : "none";
}
/** One bounded poll per tab and a boundary refresh, never a request each tick/card. */
export function CampaignSync({ initial }: { initial: CampaignClock | null }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    let stopped = false,
      inFlight = false,
      last = identity(initial);
    let boundary: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    function schedule(c: CampaignClock | null) {
      clearTimeout(boundary);
      if (!c || c.status !== "SCHEDULED") return;
      const state = campaignState(c, c.serverNow);
      const deadline = Date.parse(state === "UPCOMING" ? c.startsAt : c.endsAt);
      const delay = deadline - c.serverNow;
      if (delay > 0)
        boundary = setTimeout(
          () => void sync(),
          Math.min(delay + 100, 2147483647),
        );
    }
    async function sync(force = false) {
      if (stopped || inFlight) return;
      inFlight = true;
      const request = new AbortController();
      const timeout = setTimeout(() => request.abort(), 5000);
      const cancel = () => request.abort();
      abort.signal.addEventListener("abort", cancel, { once: true });
      try {
        const response = await fetch("/api/v1/flash-sale", {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) return;
        const c = (await response.json()) as CampaignClock | null;
        if (stopped) return;
        window.dispatchEvent(
          new CustomEvent("store:campaign-clock", { detail: c }),
        );
        const next = identity(c);
        if (next !== last || force) {
          last = next;
          window.dispatchEvent(new Event("store:campaign-changed"));
          router.refresh();
        }
        schedule(c);
      } catch {
        /* Retry on next interval; pricing remains server authoritative. */
      } finally {
        clearTimeout(timeout);
        abort.signal.removeEventListener("abort", cancel);
        inFlight = false;
      }
    }
    const restore = () => void sync(true);
    const visible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    schedule(initial);
    void sync();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, 30000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    window.addEventListener("popstate", restore);
    return () => {
      stopped = true;
      abort.abort();
      clearTimeout(boundary);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
      window.removeEventListener("popstate", restore);
    };
  }, [initial, router, pathname]);
  return null;
}
