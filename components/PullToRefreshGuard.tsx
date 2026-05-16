"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { setPullToRefreshBlocked } from "@/lib/pull-to-refresh";

/**
 * Global touch listener that suspends the native Android pull-to-
 * refresh gesture while the user is interacting with a scrollable
 * popup (any element with overflow-y: auto/scroll that isn't the
 * document body/html — hamburger menu, watchlist settings, modal
 * sheets, etc.).
 *
 * Why this is necessary: MainActivity wraps the WebView in a
 * SwipeRefreshLayout. That layout's canChildScrollUp() check reads
 * the WebView's NATIVE scroll position, which is 0 even when a
 * popup is scrolling internally. So scrolling up to the top of a
 * popup misfires as "pull to refresh." Disabling SwipeRefreshLayout
 * for the duration of the touch sequence sidesteps the misfire.
 *
 * Renders nothing. Mounted once in the root layout.
 *
 * No-op on web (the SwipeRefreshLayout only exists in the Capacitor
 * Android shell). Auto-skips the entire effect if not native.
 */
export default function PullToRefreshGuard() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    function isInsideScrollablePopup(target: EventTarget | null): boolean {
      let el = target as Element | null;
      while (el && el !== document.body && el !== document.documentElement) {
        // Element.nodeType === 1 (ELEMENT_NODE) is implicit if we
        // reached this via a real touch event, but check defensively.
        if (el.nodeType !== 1) {
          el = (el as Node).parentNode as Element | null;
          continue;
        }
        const style = window.getComputedStyle(el);
        const oy = style.overflowY;
        if (oy === "auto" || oy === "scroll") return true;
        el = el.parentElement;
      }
      return false;
    }

    function onTouchStart(e: TouchEvent) {
      if (isInsideScrollablePopup(e.target)) {
        void setPullToRefreshBlocked(true);
      }
    }
    function onTouchEnd() {
      void setPullToRefreshBlocked(false);
    }

    // Capture phase so we run BEFORE any page-level handler can
    // mutate the target. Passive: true so we don't accidentally
    // block scrolling.
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchend", onTouchEnd, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchcancel", onTouchEnd, { capture: true } as EventListenerOptions);
      // Make sure we don't leave a stale "blocked" state behind.
      void setPullToRefreshBlocked(false);
    };
  }, []);

  return null;
}
