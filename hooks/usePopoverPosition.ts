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
      // Prefer opening downward — that's where users instinctively look
      // for a dropdown. Only flip up when there's clearly not enough room
      // below AND there's more room above. The 200px threshold roughly
      // covers a 2-item suggestion popover; tighter values caused the
      // popover to spill off the bottom edge on mobile, looser values
      // caused unnecessary up-flips on desktop.
      const minSpaceBelow = 200;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceBelow < minSpaceBelow && spaceAbove > spaceBelow;
      if (openUp) {
        // Anchor the popover's BOTTOM to just above the trigger's TOP via
        // the `bottom` style. Top-positioning by `rect.top - estimate`
        // leaves a visible gap when the actual content is shorter than
        // the estimate (the bug from the previous revision).
        setStyle({
          position: "fixed",
          bottom: Math.max(margin, window.innerHeight - rect.top + 4),
          left,
          width,
          maxHeight: spaceAbove - margin - 4,
          overflowY: "auto",
        });
      } else {
        setStyle({
          position: "fixed",
          top: rect.bottom + 8,
          left,
          width,
          maxHeight: spaceBelow - margin - 8,
          overflowY: "auto",
        });
      }
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
