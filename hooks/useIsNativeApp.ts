"use client";

import { useEffect, useState } from "react";

/**
 * Detects whether the page is rendered inside the Capacitor native
 * shell (Android or iOS app). Used to gate all "subscribe" /
 * "upgrade" CTAs to comply with Apple's reader-app rules: no
 * in-app purchase flow other than Apple IAP, and no links to
 * external purchase from inside an iOS app.
 *
 * The native shell appends "RatistApp/<version> <platform>" to the
 * WebView's user-agent (configured in mobile/capacitor.config.ts).
 *
 * Returns true on Android + iOS native shells; false on regular
 * desktop/mobile web. Always false during SSR — gates that depend
 * on this should default to "show the CTA" until the hook resolves
 * on the client.
 */
export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsNative(/RatistApp\//.test(window.navigator.userAgent));
  }, []);

  return isNative;
}
