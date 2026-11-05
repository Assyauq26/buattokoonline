"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Document scroll raises the sheet; only its content scrolls at the stop. */
export function ProductInformationSheet({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const sheet = ref.current;
      if (!sheet) return;
      const css = getComputedStyle(sheet);
      const stop = parseFloat(css.top);
      setExpanded(
        css.position === "sticky" &&
          Number.isFinite(stop) &&
          sheet.getBoundingClientRect().top <= stop + 1,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, []);
  return (
    <section
      ref={ref}
      className="pdp-sheet"
      data-expanded={expanded}
      data-testid="product-information-sheet"
      aria-label="Informasi produk"
      tabIndex={0}
      onFocusCapture={(event) => {
        const sheet = ref.current;
        if (
          !sheet ||
          getComputedStyle(sheet).position !== "sticky" ||
          expanded ||
          event.target === sheet ||
          event.target.closest(".pdp-purchase-actions")
        )
          return;
        const target = event.target.getBoundingClientRect();
        if (target.bottom > innerHeight - 100) {
          const stop = parseFloat(getComputedStyle(sheet).top);
          window.scrollBy({
            top: Math.max(0, sheet.getBoundingClientRect().top - stop),
            behavior: "auto",
          });
        }
      }}
    >
      <span className="pdp-handle" aria-hidden="true" />
      {children}
    </section>
  );
}
