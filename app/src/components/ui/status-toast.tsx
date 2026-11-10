"use client";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
export function StatusToast({ message }: { message: string }) {
  const [top, setTop] = useState(80);
  useEffect(() => {
    const h = document.querySelector("[data-storefront-header]");
    if (!h) return;
    const update = () =>
      setTop(Math.max(0, h.getBoundingClientRect().bottom) + 8);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(h);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div className="customer-status-toast" style={{ top }} role="status">
      <CheckCircle2 size={18} aria-hidden="true" />
      {message}
    </div>
  );
}
