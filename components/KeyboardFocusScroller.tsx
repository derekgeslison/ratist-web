"use client";

import { useEffect } from "react";

/**
 * Mobile-only utility that keeps the focused text input above the
 * software keyboard. The default mobile browser behavior is
 * inconsistent: Safari sometimes scrolls the input into view, Chrome
 * on Android often doesn't, and Capacitor WebViews vary by version.
 * The result is users tapping a comment box / chat input and finding
 * it covered by the keyboard with no obvious way to see what they're
 * typing.
 *
 * Strategy:
 *   1. Listen at the document level for focusin on text-ish inputs.
 *   2. Wait ~300ms for the keyboard animation + visualViewport resize
 *      to settle (otherwise we'd measure against the pre-keyboard
 *      viewport and not scroll far enough).
 *   3. If the focused element's bottom edge is now below the visible
 *      area, scrollIntoView({ block: "center" }). Otherwise leave it
 *      alone so inputs that are already comfortably above the
 *      keyboard (e.g. a search bar near the top) don't jump around.
 *
 * Listens to visualViewport.resize as a backup in case the keyboard
 * appears after focusin already fired (some Android keyboards open
 * lazily on first key press).
 *
 * No-op on desktop (no visualViewport size change on focus).
 */

const KEYBOARD_ANIMATION_MS = 320;
const BOTTOM_PADDING = 24;

function isEditableElement(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    // Don't grab buttons / hidden / file / checkbox / radio etc.
    return ["text", "search", "email", "url", "tel", "password", "number"].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

function ensureVisible(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const vp = window.visualViewport;
  // visualViewport.height shrinks when the keyboard is up; offsetTop
  // is non-zero when the page is scrolled. Compare the element's
  // bottom against the visible bottom of the viewport.
  const visibleBottom = vp ? vp.offsetTop + vp.height : window.innerHeight;
  if (rect.bottom > visibleBottom - BOTTOM_PADDING) {
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      el.scrollIntoView();
    }
  }
}

export default function KeyboardFocusScroller() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let pending: ReturnType<typeof setTimeout> | null = null;

    const scrollFocused = () => {
      const active = document.activeElement;
      if (!isEditableElement(active)) return;
      ensureVisible(active);
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (!isEditableElement(target)) return;
      if (pending) clearTimeout(pending);
      pending = setTimeout(scrollFocused, KEYBOARD_ANIMATION_MS);
    };

    const onViewportResize = () => {
      // Fires when the keyboard opens/closes. If we already debounced
      // a focusin scroll, leave it alone; otherwise re-check the
      // currently focused element so late-opening keyboards still
      // trigger the scroll.
      if (pending) return;
      scrollFocused();
    };

    document.addEventListener("focusin", onFocusIn);
    window.visualViewport?.addEventListener("resize", onViewportResize);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
      if (pending) clearTimeout(pending);
    };
  }, []);

  return null;
}
