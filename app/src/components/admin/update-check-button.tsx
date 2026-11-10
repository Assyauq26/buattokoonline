"use client";
import { useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
export function UpdateCheckForm() {
  const [pending, startTransition] = useTransition(),
    router = useRouter(),
    lock = useRef(false);
  useEffect(() => {
    if (!pending) lock.current = false;
  }, [pending]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || lock.current) return;
        lock.current = true;
        startTransition(() => {
          router.push("/admin/settings/updates?check=1");
          router.refresh();
        });
      }}
    >
      <button
        disabled={pending}
        className="setting-primary min-w-36"
        aria-live="polite"
      >
        {pending && (
          <LoaderCircle
            size={16}
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
        )}
        {pending ? "Memeriksa…" : "Cek Update"}
      </button>
    </form>
  );
}
