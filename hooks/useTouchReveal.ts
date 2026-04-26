"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HINT_KEY = "ratist:touchRevealHintShown";
const PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 8;
const AUTO_DISMISS_MS = 6000;

/** Window-level event so a single mounted toast component can react to
 *  the first long-press anywhere on the page. */
const HINT_EVENT = "ratist:touchRevealFirstUse";

/**
 * Long-press-to-reveal for tile actions on touch devices. Desktops
 * with a real mouse keep the existing hover-reveal — this hook is a
 * no-op there.
 *
 * Returns props you spread onto the tile's outermost interactive
 * element and a `revealed` boolean that components use to flip the
 * action overlay's visibility + pointer-events. Reveal also dismisses
 * itself on outside-tap, scroll, or after AUTO_DISMISS_MS so users
 * aren't stuck in a "selected" state.
 */
export function useTouchReveal() {
  const [isTouch, setIsTouch] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const dismissTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  // Detect a hover-less device once on mount. The CSS media query
  // `(hover: none)` is the modern check — fingers/styluses report no
  // hover, mice report hover. More reliable than UA sniffing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(hover: none)");
    setIsTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const dismiss = useCallback(() => {
    setRevealed(false);
    if (dismissTimer.current) {
      window.clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  // Outside-tap and scroll dismiss the overlay so the tile can return
  // to "tap = navigate" semantics without a manual close.
  useEffect(() => {
    if (!revealed) return;

    const handlePointerDown = (e: PointerEvent) => {
      const node = containerRef.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) dismiss();
    };
    const handleScroll = () => dismiss();

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("scroll", handleScroll, { passive: true });

    dismissTimer.current = window.setTimeout(dismiss, AUTO_DISMISS_MS);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("scroll", handleScroll);
      if (dismissTimer.current) {
        window.clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [revealed, dismiss]);

  const cancelPress = useCallback(() => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    startPos.current = null;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isTouch) return;
    const t = e.touches[0];
    if (!t) return;
    startPos.current = { x: t.clientX, y: t.clientY };
    longPressFired.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      setRevealed(true);
      // Fire a one-time hint on the user's first successful long-press.
      // The TouchHint component listens for this event and shows the
      // toast iff the localStorage flag isn't set yet.
      try {
        if (!localStorage.getItem(HINT_KEY)) {
          window.dispatchEvent(new CustomEvent(HINT_EVENT));
          localStorage.setItem(HINT_KEY, "1");
        }
      } catch { /* private mode — silently skip */ }
    }, PRESS_MS);
  }, [isTouch]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startPos.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startPos.current.x;
    const dy = t.clientY - startPos.current.y;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) cancelPress();
  }, [cancelPress]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    cancelPress();
    // Block the synthetic click that follows a long-press so the link
    // doesn't navigate as the user is just settling on the tile to
    // reveal actions. A regular short tap still navigates because
    // longPressFired stayed false.
    if (longPressFired.current) {
      e.preventDefault();
    }
  }, [cancelPress]);

  // Suppress the iOS/Android long-press context menu (share sheet,
  // image preview, "Add link to home screen") when we're going to
  // intercept the gesture ourselves. Without this, the OS UI fights
  // our overlay reveal.
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (isTouch) e.preventDefault();
  }, [isTouch]);

  return {
    isTouch,
    revealed,
    dismiss,
    /** Spread onto the tile's root interactive element. */
    containerProps: {
      ref: (node: HTMLElement | null) => { containerRef.current = node; },
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onContextMenu,
      style: { WebkitTouchCallout: "none" as const, WebkitUserSelect: "none" as const, userSelect: "none" as const },
    },
  };
}

export const TOUCH_REVEAL_HINT_EVENT = HINT_EVENT;
