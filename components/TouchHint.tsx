"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { TOUCH_REVEAL_HINT_EVENT } from "@/hooks/useTouchReveal";

const DISMISS_KEY = "ratist:touchRevealHintDismissed";

/**
 * One-time toast shown the first time a touch user successfully
 * long-presses a movie/show tile. Mounted once in the root layout;
 * stays invisible until the hook fires the hint event, then waits
 * for an explicit X dismiss or an 8-second auto-hide.
 *
 * Two layers of "don't show again" persistence:
 *   1. The hook's own `ratist:touchRevealHintShown` (set on first
 *      successful long-press) suppresses the event entirely.
 *   2. This component additionally honors `ratist:touchRevealHintDismissed`
 *      so even if the hook's flag somehow clears (Capacitor WebView
 *      data wipe, private mode, OS storage pressure) and the event
 *      fires again, an explicit user dismiss is remembered.
 */
export default function TouchHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onHint() {
      try {
        if (localStorage.getItem(DISMISS_KEY)) return;
      } catch { /* private mode — show anyway, harmless */ }
      setVisible(true);
      window.setTimeout(() => setVisible(false), 8000);
    }
    window.addEventListener(TOUCH_REVEAL_HINT_EVENT, onHint as EventListener);
    return () => window.removeEventListener(TOUCH_REVEAL_HINT_EVENT, onHint as EventListener);
  }, []);

  function dismissForever() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] max-w-[90vw]">
      <div className="bg-[var(--ratist-red)] text-white text-sm font-medium pl-4 pr-2 py-2 rounded-full shadow-lg flex items-center gap-2">
        <span>Tip: long-press a poster to see actions</span>
        <button
          type="button"
          onClick={dismissForever}
          aria-label="Don't show again"
          className="p-1 rounded-full hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
