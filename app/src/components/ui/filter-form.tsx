"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";
import { useNavigation } from "./navigation";

/** GET remains a native fallback; enhanced submissions preserve the shared shell. */
export function FilterForm({ children, action, ...props }: Omit<ComponentPropsWithoutRef<"form">, "action"> & { action: string }) {
  const navigation = useNavigation();
  const submitted = useRef(false);
  if (!navigation?.pending) submitted.current = false;
  const pending = !!navigation?.pending && submitted.current;
  return <form {...props} action={action} method="get" aria-busy={pending || undefined} onSubmit={event => {
    if (!navigation) return;
    event.preventDefault();
    if (submitted.current) return;
    const query = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => { if (typeof value === "string" && value) query.append(key, value); });
    submitted.current = true;
    navigation.navigate(`${action}${query.size ? `?${query}` : ""}`, false);
  }}>
    <fieldset className="contents" disabled={pending}>{children}</fieldset>
    {pending && <span className="sr-only" role="status">Memuat hasil…</span>}
  </form>;
}
