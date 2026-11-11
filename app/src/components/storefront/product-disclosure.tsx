"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** Native details semantics, with an interruptible height transition for pointer input. */
export function ProductDisclosure({ title, icon, children, defaultOpen = false, testId }: {
  title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean; testId?: string;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const animation = useRef<Animation | null>(null);
  const desired = useRef(defaultOpen);
  const [expanded, setExpanded] = useState(defaultOpen);
  useEffect(() => () => animation.current?.cancel(), []);
  return <details ref={root} className="pdp-detail-row" open={defaultOpen} data-expanded={expanded} data-testid={testId}>
    <summary aria-expanded={expanded} onClick={(event) => {
      const node = root.current;
      if (!node) return;
      event.preventDefault();
      const start = node.getBoundingClientRect().height;
      animation.current?.cancel();
      const next = !desired.current;
      desired.current = next;
      setExpanded(next);
      node.open = true;
      const end = next ? node.scrollHeight : event.currentTarget.getBoundingClientRect().height;
      if (event.detail === 0 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !node.animate) {
        node.open = next;
        return;
      }
      // Height is deliberate here: adjacent information must move with the row.
      // The transition is local, short, and restarts at its currently drawn height.
      animation.current = node.animate([{ height: `${start}px` }, { height: `${end}px` }], {
        duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
      animation.current.onfinish = () => { node.open = desired.current; animation.current = null; };
    }}>
      {icon}<span>{title}</span><ChevronRight className="pdp-detail-chevron" size={19} aria-hidden="true" />
    </summary>
    <div className="pdp-detail-content">{children}</div>
  </details>;
}
