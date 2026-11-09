"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActionDialog } from "./action-dialog";
export function UnsavedFormGuard({
  children,
  revision,
}: {
  children: ReactNode;
  revision?: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    dirty = useRef(false),
    allow = useRef(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  useEffect(() => {
    dirty.current = false;
    allow.current = false;
  }, [revision]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current && !allow.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (
        !a ||
        !dirty.current ||
        allow.current ||
        a.target === "_blank" ||
        a.href === location.href ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setLeave(() => () => location.assign(a.href));
    };
    const navigate = (e: Event) => {
      const event = e as Event & {
        destination?: { url: string; key: string };
        navigationType?: string;
      };
      if (
        !dirty.current ||
        allow.current ||
        !event.cancelable ||
        !event.destination ||
        event.destination.url === location.href
      )
        return;
      event.preventDefault();
      const dest = event.destination;
      setLeave(() => () => {
        const nav = (
          window as unknown as {
            navigation?: { traverseTo: (key: string) => void };
          }
        ).navigation;
        if (event.navigationType === "traverse" && nav)
          nav.traverseTo(dest.key);
        else location.assign(dest.url);
      });
    };
    const nav = (window as unknown as { navigation?: EventTarget }).navigation;
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    nav?.addEventListener("navigate", navigate);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      nav?.removeEventListener("navigate", navigate);
    };
  }, []);
  return (
    <div
      ref={root}
      onChange={() => {
        dirty.current = true;
      }}

      onReset={() => {
        dirty.current = false;
        allow.current = false;
      }}
    >
      {children}
      <ActionDialog
        sourceRef={root}
        open={!!leave}
        title="Tinggalkan perubahan?"
        description="Perubahan yang belum disimpan akan hilang."
        primary="Tinggalkan halaman"
        onClose={() => setLeave(null)}
        onConfirm={() => {
          allow.current = true;
          leave?.();
        }}
      />
    </div>
  );
}
