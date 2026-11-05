"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { fitCardPrices } from "./fit-card-prices.mjs";

export function FittedCardPrices({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    let disposed = false, frame = 0, lastWidth = -1;
    const fit = () => { if (!disposed) fitCardPrices(row); };
    const schedule = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    fit();
    lastWidth = row.getBoundingClientRect().width;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const width = row.getBoundingClientRect().width;
      if (width === lastWidth) return;
      lastWidth = width;
      schedule();
    });
    observer?.observe(row);
    const theme = new MutationObserver(schedule);
    const root = row.closest('.storefront-root');
    if (root) theme.observe(root, { attributes: true, attributeFilter: ['style', 'class', 'data-theme-active'] });
    void document.fonts?.ready.then(schedule);
    document.fonts?.addEventListener("loadingdone", schedule);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      theme.disconnect();
      document.fonts?.removeEventListener("loadingdone", schedule);
    };
  }, [children]);
  return <div ref={ref} className="product-card-prices min-w-0">{children}</div>;
}
