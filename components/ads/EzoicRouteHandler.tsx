"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Triggers Ezoic's destroy + refresh cycle on every App Router
 * navigation. Without this, ads from the previous page leak into the
 * new page (Ezoic only scans the DOM on full page loads by default;
 * client-side navigation isn't seen).
 *
 * Pattern from https://docs.ezoic.com/docs/ezoicadsadvanced/nextjs/ —
 * destroy ALL placeholders, then on the next paint, scan the DOM and
 * fill any visible ad slots. The requestAnimationFrame gap gives React
 * time to commit the new route's markup before Ezoic looks at it.
 *
 * No-op when the SDK isn't loaded (off in dev / off pre-Incubator).
 * Mount once in app/layout.tsx alongside EzoicScripts.
 */
export default function EzoicRouteHandler() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.ezstandalone) return;
    try {
      window.ezstandalone.destroyPlaceholders();
    } catch { /* SDK not ready yet — first nav after load */ }
    requestAnimationFrame(() => {
      try {
        window.ezstandalone?.showAds();
      } catch { /* swallow — won't repeat on next nav anyway */ }
    });
  }, [pathname]);

  return null;
}
