"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Keep the Radix portal alive only for its short exit transition. */
export function useProductSheetPresence(open: boolean, enabled: boolean, instant: boolean) {
  const [present, setPresent] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    if (instant) { setPresent(open); setVisible(open); return; }
    let first = 0, second = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (open) {
      setPresent(true);
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      timer = setTimeout(() => setPresent(false), 180);
    }
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); clearTimeout(timer); };
  }, [open, enabled, instant]);
  return { present: enabled ? present : open, visible: enabled ? visible : open };
}

/** Only the local sheet shell resizes; page content never moves. */
export function ProductPurchaseMotion({ children, phase, instant, enabled }: { children: ReactNode; phase: string; instant: boolean; enabled: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const previousHeight = useRef(0);
  const transition = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const previous = transition.current ? node.getBoundingClientRect().height : previousHeight.current;
    transition.current?.cancel();
    const next = node.getBoundingClientRect().height;
    previousHeight.current = next;
    if (!previous || Math.abs(previous - next) < 1 || instant || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !node.animate) return;
    transition.current = node.animate([{ height: `${previous}px`, opacity: .7 }, { height: `${next}px`, opacity: 1 }], { duration: 220, easing: "cubic-bezier(.23, 1, .32, 1)" });
  }, [phase, instant]);
  useEffect(() => () => transition.current?.cancel(), []);
  if (!enabled) return <>{children}</>;
  return <div ref={root} className="pdp-purchase-motion">{children}</div>;
}
