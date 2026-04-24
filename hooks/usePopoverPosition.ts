"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Compute fixed-position styles for a popover anchored to a trigger element.
 * Right-aligns to the trigger, then clamps the result inside the viewport
 * with an 8px margin so we never get the off-screen-left bleed seen on
 * mobile when the trigger sits near the screen's right edge.
 *
 * Using `position: fixed` instead of `absolute` also escapes any
 * `overflow: hidden` parent — relevant when a popover lives inside a
 * rounded section container whose last row would otherwise clip the
 * popover at the bottom of the tile.
 *
 * The popover width caps at `desiredWidth` but shrinks to fit narrow
 * viewports.
 */
export function usePopoverPosition<T extends HTMLElement>(
  triggerRef: React.RefObject<T | null>,
  open: boolean,
  desiredWidth = 320,
): React.CSSProperties | undefined {
  const [style, setStyle] = useState<React.CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!open) { setStyle(undefined); return; }
    const el = triggerRef.current;
    if (!el) return;

    function compute() {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 8;
      const width = Math.min(desiredWidth, window.innerWidth - margin * 2);
      let left = rect.right - width;
      if (left < margin) left = margin;
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - width - margin;
      }
      // Default to opening downward; if the trigger is near the bottom of
      // the viewport, flip and open upward instead. 320px is a generous
      // estimate of popover height — the actual content is usually less,
      // but err on the side of more clearance.
      const estimatedHeight = 320;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      const top = openUp
        ? Math.max(margin, rect.top - estimatedHeight - 4)
        : rect.bottom + 8;
      const maxHeight = openUp
        ? rect.top - margin - 4
        : window.innerHeight - rect.bottom - margin - 8;
      setStyle({
        position: "fixed",
        top,
        left,
        width,
        maxHeight,
        overflowY: "auto",
      });
    }

    compute();
    // Recompute if the user scrolls or resizes — keeps the popover glued to
    // its trigger. Capture phase so it fires before any scroll-blocked
    // ancestors. (The popover stays open through a scroll; if that proves
    // disorienting we can swap this for a close-on-scroll behaviour.)
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open, triggerRef, desiredWidth]);

  return style;
}
