"use client";
import { useEffect, useRef } from "react";
export function useDirtyGuard(dirty: boolean) {
  const current = useRef(dirty);
  current.current = dirty;
  useEffect(() => {
    const message =
      "Ada perubahan dekorasi yang belum disimpan. Tinggalkan halaman?";
    const unload = (e: BeforeUnloadEvent) => {
      if (current.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.("a[href]");
      if (
        current.current &&
        a &&
        !a.getAttribute("href")?.startsWith("#") &&
        a.getAttribute("target") !== "_blank" &&
        !window.confirm(message)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    type Nav = { currentEntry?: { index?: number } };
    const index = () =>
      (window as Window & { navigation?: Nav }).navigation?.currentEntry
        ?.index ?? null;
    let previous = index(),
      restoring = false;
    const pop = (e: PopStateEvent) => {
      const next = index(),
        offset = previous !== null && next !== null ? previous - next : 1;
      previous = next;
      if (restoring) {
        restoring = false;
        e.stopImmediatePropagation();
        return;
      }
      if (current.current && !window.confirm(message)) {
        e.stopImmediatePropagation();
        if (offset) {
          restoring = true;
          history.go(offset);
        }
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", pop, true);
    };
  }, []);
}
