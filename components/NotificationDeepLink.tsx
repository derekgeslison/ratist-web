"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { FirebaseMessaging, type NotificationActionPerformedEvent } from "@capacitor-firebase/messaging";
import { useAuth } from "@/context/AuthContext";

/**
 * Two related responsibilities — both global to the app, both
 * mounted once in the root layout:
 *
 *   1. When any page loads with `?notif=<id>` in the query string,
 *      PATCH /api/notifications to mark that notification as read.
 *      This covers both surfaces:
 *        • Web Push: the SW navigates the browser to the URL we put
 *          on the push payload (which includes ?notif=<id>).
 *        • FCM (native Capacitor): the tap handler below also
 *          navigates to the same URL.
 *      Either way, the page loads → this hook fires → notification
 *      gets marked read without the user touching the bell icon.
 *
 *   2. On native Capacitor, listen for FCM notification taps via
 *      FirebaseMessaging.addListener('notificationActionPerformed').
 *      Extract data.url and route the in-app navigator there.
 *      Without this, tapping a push only brings the app to the
 *      foreground at whatever route the WebView was last on.
 */

const MARKED_KEY = "ratist:notif-marked";

export default function NotificationDeepLink() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const markedRef = useRef<Set<string>>(new Set());

  // ── 1. Mark-as-read on ?notif=<id> ──
  useEffect(() => {
    if (!user) return;
    const notif = searchParams?.get("notif");
    if (!notif) return;
    // Per-session dedup: same notif id during the same SPA session
    // shouldn't re-PATCH on every route change.
    if (markedRef.current.has(notif)) return;
    markedRef.current.add(notif);

    // Cross-tab dedup via sessionStorage (anyway free).
    try {
      const raw = sessionStorage.getItem(MARKED_KEY);
      const set = new Set<string>(raw ? JSON.parse(raw) : []);
      if (set.has(notif)) return;
      set.add(notif);
      sessionStorage.setItem(MARKED_KEY, JSON.stringify([...set]));
    } catch { /* private mode — best effort, fire anyway */ }

    (async () => {
      try {
        const token = await user.getIdToken();
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [notif] }),
        });
      } catch { /* non-critical */ }
    })();
  }, [searchParams, user]);

  // ── 2. Capacitor FCM tap handler ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!Capacitor.isNativePlatform()) return;

    let removed = false;
    let handle: { remove: () => Promise<void> } | null = null;
    (async () => {
      try {
        handle = await FirebaseMessaging.addListener(
          "notificationActionPerformed",
          (event: NotificationActionPerformedEvent) => {
            const data = (event?.notification?.data ?? {}) as Record<string, string | undefined>;
            const url = typeof data.url === "string" ? data.url : null;
            if (!url) return;
            // Use router.push so Next.js client navigation handles the
            // transition. Falls back to a full nav if the URL has a
            // different origin (e.g. mistakenly absolute).
            try {
              router.push(url);
            } catch {
              window.location.href = url;
            }
          },
        );
        if (removed) await handle?.remove();
      } catch { /* plugin not available — silent */ }
    })();

    return () => {
      removed = true;
      handle?.remove().catch(() => { /* already removed */ });
    };
  }, [router]);

  // ── 3. Capacitor App Links (deep links) handler ──
  // When a user taps a theratist.com link from another app (Messages,
  // email, etc.) and the Ratist app is ALREADY running, Capacitor's
  // App plugin fires `appUrlOpen`. Without this listener, the click
  // brings the app to foreground but the WebView stays on whatever
  // page it was last on. Cold-start (app not running) is handled by
  // BridgeActivity automatically — the launching Intent's URL gets
  // routed via the server.url bridge.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!Capacitor.isNativePlatform()) return;

    let removed = false;
    let handle: { remove: () => Promise<void> } | null = null;
    (async () => {
      try {
        handle = await App.addListener("appUrlOpen", ({ url }) => {
          if (typeof url !== "string") return;
          // Only route same-origin URLs. External URLs would be a
          // surprise security/UX bug — those should open in the
          // system browser, which is the default behavior.
          let parsed: URL;
          try { parsed = new URL(url); } catch { return; }
          const allowedHosts = ["www.theratist.com", "theratist.com"];
          if (!allowedHosts.includes(parsed.hostname)) return;
          const path = parsed.pathname + parsed.search + parsed.hash;
          try {
            router.push(path || "/");
          } catch {
            window.location.href = path || "/";
          }
        });
        if (removed) await handle?.remove();
      } catch { /* plugin not available — silent */ }
    })();

    return () => {
      removed = true;
      handle?.remove().catch(() => { /* already removed */ });
    };
  }, [router]);

  // Strip ?notif=… from the URL after we've handled it, so it's not
  // a permanent part of the user's browser history / shareable link.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const notif = searchParams?.get("notif");
    if (!notif || !pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("notif");
    const rest = params.toString();
    const clean = rest ? `${pathname}?${rest}` : pathname;
    router.replace(clean + window.location.hash);
  }, [searchParams, pathname, router]);

  return null;
}
