"use client";
import { useState } from "react";
export function ProductDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p
        className="whitespace-pre-line text-sm leading-relaxed"
        style={
          !open && text.length > 200
            ? {
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
            : undefined
        }
      >
        {text || "Deskripsi produk belum tersedia."}
      </p>
      {text.length > 200 && (
        <button
          className="min-h-11 text-sm underline"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Ringkas deskripsi" : "Lihat deskripsi lengkap"}
        </button>
      )}
    </div>
  );
}
