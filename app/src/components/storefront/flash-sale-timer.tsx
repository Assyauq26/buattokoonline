"use client";
import { useEffect, useSyncExternalStore } from "react";
import {
  campaignState,
  type CampaignClock,
} from "@/modules/promotions/campaign.validation";
// One monotonic, server-synchronized clock per tab; only timer children subscribe.
let tick = 0;
let anchor: { server: number; monotonic: number } | null = null;
let interval: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
function sync(event: Event) {
  const c = (event as CustomEvent<CampaignClock | null>).detail;
  if (c) {
    anchor = { server: c.serverNow, monotonic: performance.now() };
    tick = performance.now();
    listeners.forEach((fn) => fn());
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!interval) {
    window.addEventListener("store:campaign-clock", sync);
    interval = setInterval(() => {
      tick = performance.now();
      listeners.forEach((fn) => fn());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(interval);
      interval = undefined;
      tick = 0;
      anchor = null;
      window.removeEventListener("store:campaign-clock", sync);
    }
  };
}
export function FlashSaleTimer({
  campaign,
  compact = false,
  inline = false,
  segmented = false,
}: {
  campaign: CampaignClock;
  compact?: boolean;
  inline?: boolean;
  segmented?: boolean;
}) {
  const elapsed = useSyncExternalStore(
    subscribe,
    () => tick,
    () => 0,
  );
  useEffect(() => {
    if (!anchor) {
      anchor = { server: campaign.serverNow, monotonic: performance.now() };
      tick = performance.now();
      listeners.forEach((fn) => fn());
    }
  }, [campaign.serverNow]);
  // Server snapshot0 is also the hydration snapshot, even with already-mounted timers.
  const now =
    elapsed === 0 || !anchor
      ? campaign.serverNow
      : anchor.server + Math.max(0, elapsed - anchor.monotonic);
  const phase = campaignState(campaign, now);
  const deadline = Date.parse(
    phase === "UPCOMING" ? campaign.startsAt : campaign.endsAt,
  );
  const remaining =
    phase === "ACTIVE" || phase === "UPCOMING"
      ? Math.max(0, Math.ceil((deadline - now) / 1000))
      : 0;
  const time = [
    Math.floor(remaining / 3600),
    Math.floor((remaining % 3600) / 60),
    remaining % 60,
  ]
    .map((v) => String(v).padStart(2, "0"));
  const label =
    phase === "UPCOMING"
      ? "Flash Sale Dimulai Dalam"
      : phase === "ACTIVE"
        ? "Berakhir Dalam"
        : "Flash Sale Telah Berakhir";
  return (
    <div
      className={
        segmented ? "flash-clock" : inline
          ? "flex flex-wrap items-center gap-x-1 text-[10px] leading-relaxed"
          : compact
            ? "text-xs"
            : "text-sm"
      }
      data-testid="flash-timer"
      data-campaign-id={campaign.id}
      data-deadline={phase === "UPCOMING" ? campaign.startsAt : campaign.endsAt}
    >
      <span className={segmented ? "sr-only" : undefined}>{label}</span>
      <time
        dateTime={`PT${remaining}S`}
        className={segmented ? "flash-clock-time tabular-nums" : `font-semibold tabular-nums ${inline ? "" : "mt-1 block tracking-wide " + (compact ? "text-xl" : "text-2xl")}`}
      >
        {segmented ? time.map((value, index) => (
          <span className="flash-clock-segment" key={index}>
            {index > 0 && <span className="flash-clock-colon">:</span>}
            <span className="flash-clock-unit"><strong>{value}</strong><small>{["Jam", "Menit", "Detik"][index]}</small></span>
          </span>
        )) : time.join(":")}
      </time>
    </div>
  );
}
