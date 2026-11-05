"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";

export function reorderById<T extends { id: string }>(items: T[], from: string, to: string): T[] {
  const start = items.findIndex(item => item.id === from), end = items.findIndex(item => item.id === to);
  if (start < 0 || end < 0 || start === end) return items;
  const next = [...items];
  next.splice(end, 0, next.splice(start, 1)[0]);
  return next;
}
/** Pointer Events cover mouse, pen and touch; only the handle claims touch scrolling. */
export function SortableHandle({ id, scope, label, disabled, onMove }: {
  id: string; scope: string; label: string; disabled?: boolean; onMove: (from: string, to: string) => void;
}) {
  const help = useId();
  const button = useRef<HTMLButtonElement>(null);
  const keyboardMode = useRef(false);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");
  const latest = useRef(onMove); latest.current = onMove;
  const cleanup = useRef<() => void>();
  useLayoutEffect(() => { if (active && keyboardMode.current) button.current?.focus({ preventScroll: true }); }, [label, active, onMove]);
  useEffect(() => () => cleanup.current?.(), []);
  return <>
    <button ref={button} type="button" className="sort-handle" data-dragging={active || undefined}
      aria-label={`Urutkan ${label}`} aria-describedby={help} aria-pressed={active} disabled={disabled}
      onClick={event => { event.preventDefault(); event.stopPropagation(); }}
      onPointerDown={event => {
        event.stopPropagation();
        if (event.button !== 0) return;
        keyboardMode.current = false;
        cleanup.current?.();
        const start = { id: event.pointerId, x: event.clientX, y: event.clientY };
        const viewport = event.currentTarget.closest<HTMLElement>(".seller-editor-scroll");
        const move = (pointer: PointerEvent) => {
          if (pointer.pointerId !== start.id || Math.hypot(pointer.clientX - start.x, pointer.clientY - start.y) < 6) return;
          setActive(true);
          const target = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest<HTMLElement>(`[data-sort-scope="${CSS.escape(scope)}"]`);
          if (target?.dataset.sortId && target.dataset.sortId !== id) latest.current(id, target.dataset.sortId);
          if (viewport) {
            const rect = viewport.getBoundingClientRect();
            if (pointer.clientY > rect.bottom - 48) viewport.scrollBy(0, 16);
            if (pointer.clientY < rect.top + 48) viewport.scrollBy(0, -16);
          }
        };
        const stop = () => {
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", stop);
          document.removeEventListener("pointercancel", stop);
          setActive(false); setMessage("Urutan diperbarui dalam formulir.");
          cleanup.current = undefined;
        };
        // Document listeners survive DOM reinsertions when React changes display order.
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", stop);
        document.addEventListener("pointercancel", stop);
        cleanup.current = stop;
      }}
      onKeyDown={event => {
        event.stopPropagation();
        if ([" ", "Enter", "Escape"].includes(event.key)) {
          event.preventDefault(); keyboardMode.current = event.key !== "Escape" && !active; setActive(keyboardMode.current); return;
        }
        if (!active || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const items = Array.from(document.querySelectorAll<HTMLElement>(`[data-sort-scope="${CSS.escape(scope)}"]`));
        const index = items.findIndex(item => item.dataset.sortId === id);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : index + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1);
        const target = items[next];
        if (target?.dataset.sortId) { latest.current(id, target.dataset.sortId); setMessage(`Posisi ${next + 1} dari ${items.length}.`); }
      }}><GripVertical size={18} aria-hidden="true" /></button>
    <span id={help} className="sr-only">Tekan dan geser untuk mengurutkan. Keyboard: Spasi, tombol arah, lalu Enter.</span>
    <span className="sr-only" aria-live="polite">{message}</span>
  </>;
}
