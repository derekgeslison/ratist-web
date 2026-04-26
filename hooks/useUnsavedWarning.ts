"use client";

import { useEffect } from "react";

const PROMPT = "You have unsaved changes. Leave anyway?";

/**
 * Warns the user before they navigate away with unsaved changes.
 * Three layers, because no single browser API covers everything:
 *
 *   1. `beforeunload` — handles tab close / refresh / typing a new
 *      URL / following an external link. Native browser dialog.
 *   2. Capture-phase click listener on internal anchors — handles
 *      clicking a Next.js <Link> (which is a regular <a> with a JS
 *      onClick that does router.push). Capture phase runs before
 *      Link's onClick so we can preventDefault + stopImmediatePropagation
 *      to cancel. Native window.confirm.
 *   3. `popstate` interception — handles the browser back/forward
 *      button. Pushes a sentinel state on mount; on popstate, prompts
 *      and re-pushes if the user wants to stay.
 *
 * Pass `dirty: true` to enable. All three are torn down when dirty
 * flips back to false.
 */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a) return;
      // Skip new-tab clicks, modifier-clicks, hash links, and
      // explicit external targets — none of those navigate this tab
      // away from the current page.
      if (a.target === "_blank") return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = a.getAttribute("href");
      if (!href || href === "#" || href.startsWith("#")) return;
      // Same-origin check: external links go through beforeunload
      // anyway; we only need to confirm same-origin (in-app) navs.
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return;
        }
      } catch { /* relative URL or hash-only — fall through */ }

      if (!window.confirm(PROMPT)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", onClick, true);

    // Trap back/forward by pushing a sentinel state and re-pushing
    // it on popstate when the user cancels. The browser still
    // technically navigates back once (consuming the sentinel),
    // which we counter by pushing a fresh sentinel.
    const sentinel = { __unsavedSentinel: Date.now() };
    window.history.pushState(sentinel, "", window.location.href);
    const onPopState = () => {
      if (!window.confirm(PROMPT)) {
        window.history.pushState(sentinel, "", window.location.href);
      }
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [dirty]);
}
