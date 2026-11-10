"use client";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
export function SaveLabel({
  busy,
  children,
}: {
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="settings-save-label" aria-live="polite">
      <span className={busy ? "invisible" : ""}>{children}</span>
      {busy && (
        <span className="settings-saving">
          <LoaderCircle
            size={16}
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Menyimpan…
        </span>
      )}
    </span>
  );
}
export function SettingsFeedback({ message }: { message: string }) {
  const [toast, setToast] = useState(false);
  useEffect(() => {
    setToast(!!message);
    const timer = setTimeout(() => setToast(false), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <>
      {message && (
        <p className="settings-feedback" role="status">
          {message}
        </p>
      )}
      {toast && (
        <div className="settings-toast" aria-hidden="true">
          {message}
        </div>
      )}
    </>
  );
}
