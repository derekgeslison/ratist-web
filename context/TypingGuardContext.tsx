"use client";

import { createContext, useContext, useEffect, useRef, useCallback } from "react";

/**
 * Global typing guard — detects when ANY <input> or <textarea> on the page
 * is focused, so polling/auto-refresh can skip state updates that would
 * clobber the user's keystrokes.
 *
 * Works automatically via document-level focus/blur event delegation.
 * No per-input wiring needed.
 *
 * Usage in any component:
 *   const isTyping = useIsTyping();
 *   // In a polling interval:
 *   setInterval(() => { if (!isTyping()) fetchData(); }, 5000);
 */

const TypingGuardContext = createContext<() => boolean>(() => false);

function isTextInput(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type.toLowerCase();
    return type === "text" || type === "search" || type === "url" ||
           type === "email" || type === "tel" || type === "number" ||
           type === "password";
  }
  // contentEditable divs
  if (el.isContentEditable) return true;
  return false;
}

export function TypingGuardProvider({ children }: { children: React.ReactNode }) {
  const focusedRef = useRef(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      if (isTextInput(e.target)) {
        if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
        focusedRef.current = true;
      }
    }
    function onFocusOut(e: FocusEvent) {
      if (isTextInput(e.target)) {
        // Small delay so the guard holds during field-to-field tabbing
        blurTimerRef.current = setTimeout(() => { focusedRef.current = false; }, 150);
      }
    }
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const isTyping = useCallback(() => focusedRef.current, []);

  return (
    <TypingGuardContext.Provider value={isTyping}>
      {children}
    </TypingGuardContext.Provider>
  );
}

export function useIsTyping() {
  return useContext(TypingGuardContext);
}
