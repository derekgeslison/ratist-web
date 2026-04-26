"use client";

import { useEffect } from "react";

/**
 * Pops the browser's native "Leave site?" confirmation when the user
 * tries to refresh, close, or navigate away (typing a new URL,
 * clicking an external link). Pass `dirty: true` to enable.
 *
 * Note: this does NOT intercept Next.js App Router client-side
 * navigation (i.e., clicking a <Link>) — there's no public API for
 * that yet. Covers the most common cases (tab close, refresh,
 * external nav) which are the ones most likely to surprise the user.
 */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // returnValue must be set for some older browsers to show the
      // native confirmation; modern Chrome/Firefox ignore the value
      // and use a generic message regardless.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
