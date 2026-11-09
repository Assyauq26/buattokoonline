"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Nonmodal navigation: Tab can leave; Escape restores the invoker. */
export function ActionPopover({
  label,
  trigger,
  children,
  className = "",
  panelClassName = "",
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const id = useId(),
    pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    panel.current
      ?.querySelector<HTMLElement>("a[href],button:not(:disabled)")
      ?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          ref={panel}
          aria-label={label}
          className={`absolute right-0 z-50 w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 text-zinc-900 shadow-xl ${panelClassName}`}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a,button")) {
              setOpen(false);
              if ((event.target as HTMLElement).closest("button"))
                button.current?.focus();
            }
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
