"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Detects whether the page is rendered inside the Capacitor native
 * shell (Android or iOS app). Used to gate all "subscribe" /
 * "upgrade" CTAs to comply with Apple's reader-app rules: no
 * in-app purchase flow other than Apple IAP, and no links to
 * external purchase from inside an iOS app.
 *
 * Detection signals (either is sufficient):
 *  - User-agent contains "RatistApp/" (suffix appended in
 *    mobile/capacitor.config.ts)
 *  - Capacitor SDK reports `isNativePlatform()` — harder to spoof
 *    than UA in dev tools, used as defense-in-depth
 *
 * Return value:
 *  - `null` = not yet resolved (SSR / pre-mount). **Callers MUST treat
 *    null as "may be native" and avoid rendering purchase CTAs while
 *    unresolved.** Otherwise the iOS WebView's first paint shows the
 *    web purchase UI for ~50-200ms before the useEffect ticks — which
 *    Apple reviewers actively test for under Guideline 3.1.3.
 *  - `true` = native shell confirmed.
 *  - `false` = standard browser confirmed.
 *
 * `initial` — when a parent server component has already detected the
 * native state via `headers().get("user-agent")`, pass it here. The
 * hook then starts resolved on first render, eliminating the brief
 * null/skeleton state.
 */
export function useIsNativeApp(initial?: boolean): boolean | null {
  const [isNative, setIsNative] = useState<boolean | null>(initial ?? null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const uaMatch = /RatistApp\//.test(window.navigator.userAgent);
    const capacitorNative = Capacitor.isNativePlatform();
    setIsNative(uaMatch || capacitorNative);
  }, []);

  return isNative;
}
