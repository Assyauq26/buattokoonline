"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OPERATION_NOTICE_KEY } from "./operation-navigation";
export function OperationNotice() {
  const [savedPath, setSavedPath] = useState<string | null>(null); const visible = savedPath === usePathname(); const notice = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    try { const raw = sessionStorage.getItem(OPERATION_NOTICE_KEY); sessionStorage.removeItem(OPERATION_NOTICE_KEY); if (raw) { const value = JSON.parse(raw); if (value.path === location.pathname && typeof value.at === "number" && Date.now() >= value.at && Date.now() - value.at < 60000) setSavedPath(value.path); } } catch { /* Optional, non-sensitive UI notice only. */ }
  }, []);
  useEffect(() => { if (visible) notice.current?.focus(); }, [visible]);
  return visible ? <p ref={notice} tabIndex={-1} role="status" className="mb-6 rounded-xl border border-line bg-white p-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-black">Perubahan berhasil disimpan. Data terbaru sudah dimuat.</p> : null;
}
