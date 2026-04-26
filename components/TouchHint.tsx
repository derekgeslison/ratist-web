"use client";

import { useEffect, useState } from "react";
import { TOUCH_REVEAL_HINT_EVENT } from "@/hooks/useTouchReveal";

/**
 * One-time toast shown the first time a touch user successfully
 * long-presses a movie/show tile. Mounted once in the root layout;
 * stays invisible until the hook fires the hint event, then auto-
 * dismisses after a few seconds. The localStorage flag lives in the
 * hook itself so we never double-show even if this component is
 * unmounted/remounted.
 */
export default function TouchHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onHint() {
      setVisible(true);
      window.setTimeout(() => setVisible(false), 5000);
    }
    window.addEventListener(TOUCH_REVEAL_HINT_EVENT, onHint as EventListener);
    return () => window.removeEventListener(TOUCH_REVEAL_HINT_EVENT, onHint as EventListener);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] max-w-[90vw]">
      <div className="bg-[var(--ratist-red)] text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2">
        <span>Tip: long-press a poster to see actions</span>
      </div>
    </div>
  );
}
