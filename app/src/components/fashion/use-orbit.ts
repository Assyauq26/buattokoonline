"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent,
} from "react";
import { offsetFrom, orbitStyle, wrap, anglePerProduct } from "./orbit";

type Options = {
  index: number;
  total: number;
  positions: number[];
  select: (index: number) => void;
  highlight: (index: number) => void;
  category: (delta: number) => void;
};
export function useOrbit(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const stage = useRef<HTMLDivElement>(null);
  const position = useRef(options.index);
  const raf = useRef(0);
  const highlighted = useRef(options.index);
  const stepWidth = useRef(140);
  const mobile = useRef(false);
  const paintFrame = useRef(0);
  const wheelEnd = useRef<ReturnType<typeof setTimeout>>();
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    origin: number;
    axis: "x" | "y" | null;
    last: number;
    lastTime: number;
    speed: number;
  } | null>(null);
  const blockClick = useRef(false);
  const touches = useRef(new Set<number>());
  const paint = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    const { total, positions, highlight } = latest.current;
    // Hysteresis keeps two slow, adjacent positions from repeatedly swapping the hero.
    if (
      Math.abs(offsetFrom(highlighted.current, position.current, total)) > 0.58
    ) {
      const nearest = wrap(Math.round(position.current), total);
      if (nearest !== highlighted.current && positions.includes(nearest)) {
        highlighted.current = nearest;
        highlight(nearest);
      }
    }
    for (const card of el.querySelectorAll<HTMLElement>("[data-pos]")) {
      const style = orbitStyle(
        offsetFrom(
          Number(card.dataset.pos),
          position.current,
          latest.current.total,
        ),
        latest.current.total,
        mobile.current,
      );
      card.style.transform = style.transform;
      card.style.opacity = String(style.opacity);
      card.style.zIndex = String(style.zIndex);
      card.style.pointerEvents = style.opacity < 0.02 ? "none" : "";
    }
  }, []);
  const stop = () => {
    clearTimeout(wheelEnd.current);
    cancelAnimationFrame(paintFrame.current);
    paintFrame.current = 0;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
  };
  function bound(value: number) {
    const { total, index, positions } = latest.current;
    if (total <= 2) return Math.max(0, Math.min(total - 1, value));
    if (positions.length === total) return value;
    const anchor =
      position.current + offsetFrom(index, position.current, total);
    let left = 0,
      right = 0;
    while (positions.includes(wrap(index - left - 1, total))) left++;
    while (positions.includes(wrap(index + right + 1, total))) right++;
    return Math.max(anchor - left, Math.min(anchor + right, value));
  }
  function snap(destination: number, velocity = 0, instant = false) {
    stop();
    const to = Math.round(bound(destination));

    const finish = () => {
      position.current = to;
      paint();
      latest.current.select(wrap(to, latest.current.total));
    };
    if (
      instant ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      Math.abs(to - position.current) < 0.001
    ) {
      finish();
      return;
    }
    const from = position.current,
      started = performance.now(),
      rate = 22;
    // Closed form critically damped spring. Time step is independent of refresh rate.
    function tick(now: number) {
      const t = (now - started) / 1000,
        d = from - to;
      position.current =
        to + (d + (velocity + rate * d) * t) * Math.exp(-rate * t);
      paint();
      if (t > 0.48 || (t > 0.08 && Math.abs(position.current - to) < 0.002)) {
        raf.current = 0;
        finish();
      } else raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
  }
  useLayoutEffect(() => {
    paint();
  });
  useLayoutEffect(() => {
    if (!stage.current) return;
    function size() {
      const el = stage.current!;
      mobile.current = matchMedia("(max-width:767px)").matches;
      // dx/dphase at the front tangent equals radius times the angle per item.
      // Resolve the actual CSS radius once per resize (also in the seller iframe).
      const radius = parseFloat(getComputedStyle(el, "::before").width);
      stepWidth.current = Math.max(
        60,
        radius * anglePerProduct(mobile.current),
      );
      paint();
    }
    size();
    const observer = new ResizeObserver(size);
    observer.observe(stage.current);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [paint]);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  useEffect(() => {
    const el = stage.current;
    if (!el) return;

    const wheel = (e: WheelEvent) => {
      if (
        e.ctrlKey ||
        pointer.current ||
        Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.3 ||
        latest.current.total < 2
      )
        return;
      e.preventDefault();
      stop();
      position.current = bound(
        position.current +
          (e.deltaX * (e.deltaMode === 1 ? 16 : 1)) / stepWidth.current,
      );
      paint();
      wheelEnd.current = setTimeout(
        () => snapRef.current(position.current),
        85,
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      clearTimeout(wheelEnd.current);
      el.removeEventListener("wheel", wheel);
    };
  }, [paint]);
  function down(e: PointerEvent<HTMLElement>) {
    if (
      e.button !== 0 ||
      (e.target as HTMLElement).closest(
        "input,form,button,fieldset,.fashion-meta",
      )
    )
      return;
    touches.current.add(e.pointerId);
    if (!e.isPrimary || touches.current.size > 1) {
      pointer.current = null;
      blockClick.current = true;
      snap(position.current);
      return;
    }
    stop();
    blockClick.current = false;
    (e.target as Element).setPointerCapture(e.pointerId);
    pointer.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      origin: position.current,
      axis: null,
      last: e.clientX,
      lastTime: e.timeStamp,
      speed: 0,
    };
  }
  function move(e: PointerEvent<HTMLElement>) {
    const p = pointer.current;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    if (!p.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
      blockClick.current = true;
      if (Math.abs(dx) > Math.abs(dy) * 1.18) p.axis = "x";
      else if (Math.abs(dy) > Math.abs(dx) * 1.18) p.axis = "y";
      else return;
    }
    if (p.axis === "x") {
      position.current = bound(p.origin - dx / stepWidth.current);
      const dt = Math.max(1, e.timeStamp - p.lastTime);
      p.speed =
        0.35 * p.speed +
        (0.65 * (p.last - e.clientX) * 1000) / (dt * stepWidth.current);
      p.last = e.clientX;
      p.lastTime = e.timeStamp;
      if (!paintFrame.current)
        paintFrame.current = requestAnimationFrame(() => {
          paintFrame.current = 0;
          paint();
        });
    }
  }
  function end(e: PointerEvent<HTMLElement>, cancelled = false) {
    touches.current.delete(e.pointerId);
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    pointer.current = null;
    if (p.axis === "y" && !cancelled && Math.abs(e.clientY - p.y) > 38) {
      latest.current.category(e.clientY < p.y ? 1 : -1);
      return;
    }
    const v =
      !cancelled && p.axis === "x" && e.timeStamp - p.lastTime < 90
        ? Math.max(-5, Math.min(5, p.speed))
        : 0;
    if (
      p.axis ||
      cancelled ||
      Math.abs(position.current - Math.round(position.current)) > 0.001
    )
      snap(position.current + v * 0.12, v);
  }
  return {
    stage,
    blockClick,
    down,
    move,
    end,
    step: (d: number) => snap(Math.round(position.current) + d, 0, true),
    choose: (pos: number) =>
      snap(
        position.current +
          offsetFrom(pos, position.current, latest.current.total),
      ),
    paint,
  };
}
