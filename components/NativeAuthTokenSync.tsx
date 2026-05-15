"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/context/AuthContext";

// Mirrors the signed-in user's Firebase ID token into the native
// app's SharedPreferences so out-of-WebView components (Android home-
// screen widgets, iOS widgets / live activities) can authenticate to
// our API.
//
// Why: capacitor.config.ts sets `skipNativeAuth: true` so cold start
// is fast (5-15s faster than letting the native Firebase SDK sync
// its session). The tradeoff is the native FirebaseAuth instance
// has no current user — meaning widgets can't call
// FirebaseAuth.getInstance().getCurrentUser().getIdToken() to authenticate.
//
// Workaround: the JS SDK (which IS signed in) writes the latest ID
// token into Capacitor Preferences. Widgets read from the same
// SharedPreferences slot ("CapacitorStorage" → "ratistIdToken").
// Firebase rotates the token every hour, so this component refreshes
// every 45 minutes — well inside the expiry window.
//
// Renders nothing. Mounted once at the root layout.
//
// Note: the Preferences plugin is imported dynamically only when we
// confirm we're running natively. Imports are cheap on web but the
// dynamic guard avoids touching a plugin shim that has no work to
// do off-native.

const REFRESH_INTERVAL_MS = 45 * 60 * 1000;
const PREF_KEY = "ratistIdToken";

export default function NativeAuthTokenSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function persist(token: string | null) {
      try {
        const { Preferences } = await import("@capacitor/preferences");
        if (cancelled) return;
        if (token) {
          await Preferences.set({ key: PREF_KEY, value: token });
        } else {
          await Preferences.remove({ key: PREF_KEY });
        }
      } catch {
        // Plugin not bundled in the running app build — silent.
        // Triggers when the user is on an older build that doesn't
        // include @capacitor/preferences yet. Next app update fixes.
      }
    }

    async function refresh() {
      if (cancelled) return;
      if (!user) {
        await persist(null);
        return;
      }
      try {
        const token = await user.getIdToken(/* forceRefresh */ false);
        await persist(token);
      } catch {
        // Token fetch can fail transiently (offline, etc.) — leave
        // the previously-stored token in place; it's still valid
        // for up to an hour.
      }
      if (cancelled) return;
      timer = setTimeout(refresh, REFRESH_INTERVAL_MS);
    }

    refresh();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user]);

  return null;
}
