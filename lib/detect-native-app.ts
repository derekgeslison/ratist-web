import { headers } from "next/headers";

/**
 * Server-side native-app detection via the User-Agent header. The
 * Capacitor shell appends "RatistApp/<version> <platform>" to the
 * WebView's UA (see mobile/capacitor.config.ts).
 *
 * Used by server components that render purchase / subscribe surfaces
 * to pass an `initial` value into `useIsNativeApp`. This eliminates
 * the hydration flash where iOS users briefly see the web purchase
 * UI before the client hook resolves — an active Apple Guideline
 * 3.1.3 review risk.
 *
 * Returns false for unauthenticated UA reads (no UA header) — safe
 * default for web browsers. The client hook will still resolve the
 * correct value on mount in any edge case.
 */
export async function detectNativeAppFromHeaders(): Promise<boolean> {
  const userAgent = (await headers()).get("user-agent") ?? "";
  return /RatistApp\//.test(userAgent);
}
