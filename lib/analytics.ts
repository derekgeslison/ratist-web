/**
 * Thin wrapper around GA4's window.gtag for sending custom events from
 * client components. Silently noops when gtag isn't present (SSR, ad blocker,
 * or NEXT_PUBLIC_GA_ID missing) so callers don't need to guard.
 */
export function track(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== "function") return;
  try {
    gtag("event", event, params ?? {});
  } catch {
    // GA4 failures must never break the app. Swallow.
  }
}
