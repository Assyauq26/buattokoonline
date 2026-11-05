"use client";

import { createContext, forwardRef, useContext, useState, useTransition, type ComponentPropsWithoutRef, type ReactNode } from "react";
import NextLink, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

const NavigationContext = createContext<{
  pending: boolean;
  destination: string;
  navigate: (href: string, scroll?: boolean) => void;
} | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState("");
  function navigate(href: string, scroll = true) {
    setDestination(href);
    startTransition(() => router.push(href, { scroll }));
  }
  return <NavigationContext.Provider value={{ pending, destination, navigate }}>
    {children}
    <NavigationPendingIndicator pending={pending} />
  </NavigationContext.Provider>;
}

export function useNavigation() { return useContext(NavigationContext); }

/**
 * Native Next.js link navigation is the source of truth for anchor clicks.
 * IMPORTANT: Never call preventDefault()/router.push() from onNavigate.
 * Doing both has led to aborted RSC transitions and intermittent stale pages.
 *
 * Link-level pending feedback comes from Next's own useLinkStatus hook, so the
 * loading indicator cannot become stuck due to a competing transition.
 */
// A fixed indicator rendered inside an anchor can become anchored to that
// button when an ancestor has a CSS transform. That produced a stray black
// line above product and navigation buttons. Portal to <body> instead so the
// indicator always belongs to the viewport, never a transformed link.
function NavigationPendingIndicator({ pending }: { pending: boolean }) {
  if (!pending || typeof document === "undefined") return null;
  return createPortal(
    <span role="status" aria-live="polite" data-testid="navigation-pending"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 block h-0.5 bg-zinc-500/70">
      <span className="sr-only">Memuat halaman…</span>
    </span>,
    document.body,
  );
}
function NativeLinkPendingFeedback() {
  const { pending } = useLinkStatus();
  return <NavigationPendingIndicator pending={pending} />;
}

const NavigationLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<typeof NextLink>>(function NavigationLink({ children, onNavigate, ...props }, ref) {
  return <NextLink {...props} ref={ref} onNavigate={onNavigate}>
    {children}
    <NativeLinkPendingFeedback />
  </NextLink>;
});
export default NavigationLink;
