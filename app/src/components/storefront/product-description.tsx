"use client";
import { useEffect, useRef, useState } from "react";

export function ProductDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  const animation = useRef<Animation | null>(null);
  useEffect(() => () => animation.current?.cancel(), []);
  return <div>
    <p ref={paragraph} className="whitespace-pre-line text-sm leading-relaxed" style={!open && text.length > 200 ? { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>
      {text || "Deskripsi produk belum tersedia."}
    </p>
    {text.length > 200 && <button type="button" className="min-h-11 text-sm underline" aria-expanded={open} onClick={(event) => {
      const node = paragraph.current;
      const start = node?.getBoundingClientRect().height ?? 0;
      animation.current?.cancel();
      setOpen(!open);
      if (event.detail === 0 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !node?.animate) return;
      requestAnimationFrame(() => {
        const end = node.getBoundingClientRect().height;
        animation.current = node.animate([{ height: `${start}px` }, { height: `${end}px` }], { duration: 200, easing: "cubic-bezier(.23,1,.32,1)" });
      });
    }}>{open ? "Ringkas deskripsi" : "Lihat deskripsi lengkap"}</button>}
  </div>;
}
