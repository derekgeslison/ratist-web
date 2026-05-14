"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { useAuth } from "@/context/AuthContext";

// VAPID public key — base64-url encoded. Browsers need it converted to
// a Uint8Array before calling pushManager.subscribe.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

export interface UsePushState {
  /** True when push is supported on this surface (native always; web only when SW/Notification/PushManager all exist). */
  supported: boolean;
  /** True when running inside the Capacitor native shell. */
  isNative: boolean;
  /** Current notification permission ("default" = not yet asked). */
  permission: PermissionState;
  /** True if currently subscribed (web subscription exists OR native FCM token registered locally). */
  subscribed: boolean;
  /** Becomes true while subscribe/unsubscribe is in flight. */
  busy: boolean;
  /** Last error from a subscribe/unsubscribe call. */
  error: string | null;
  /** Request permission + subscribe (web) OR register FCM token (native). */
  enable: () => Promise<void>;
  /** Unsubscribe locally + server-side. */
  disable: () => Promise<void>;
}

const NATIVE_TOKEN_KEY = "ratist:fcm-token";

export function usePush(): UsePushState {
  const { user } = useAuth();
  const [supported, setSupported] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [permission, setPermission] = useState<PermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Push fresh FCM token to the server. Used by both the launch-time
  // refresh below and the tokenReceived listener. Idempotent (server
  // upserts by token).
  const registerToken = useCallback(
    async (token: string) => {
      if (!user) return;
      try {
        const idToken = await user.getIdToken();
        const platform = Capacitor.getPlatform();
        const res = await fetch("/api/push/fcm/register", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ token, platform }),
        });
        if (res.ok) {
          try { localStorage.setItem(NATIVE_TOKEN_KEY, token); } catch { /* non-fatal */ }
        }
      } catch {
        // Non-fatal — next launch / next rotation will retry.
      }
    },
    [user],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const native = Capacitor.isNativePlatform();
    setIsNative(native);

    if (native) {
      // Native: support is always available; permission comes from
      // FirebaseMessaging.checkPermissions(). "subscribed" means we
      // have an FCM token cached locally that the server knows about.
      setSupported(true);

      let cancelled = false;
      let tokenListener: { remove: () => Promise<void> } | null = null;

      (async () => {
        let perm: PermissionState = "default";
        try {
          const p = await FirebaseMessaging.checkPermissions();
          perm = (p.receive as PermissionState) ?? "default";
        } catch { /* keep default */ }
        if (cancelled) return;
        setPermission(perm);

        let cached: string | null = null;
        try { cached = localStorage.getItem(NATIVE_TOKEN_KEY); } catch { /* ignore */ }
        setSubscribed(!!cached);

        // If permission is already granted on this device, refresh the
        // FCM token from the OS and compare against the cached one.
        // After an app update the OS may have rotated the token —
        // without this re-check the server keeps the old, no-longer-
        // valid token and every push fails with
        // registration-token-not-registered.
        if (perm === "granted" && user) {
          try {
            const { token: fresh } = await FirebaseMessaging.getToken();
            if (!cancelled && fresh && fresh !== cached) {
              await registerToken(fresh);
              if (!cancelled) setSubscribed(true);
            }
          } catch { /* non-fatal — user can still re-enable manually */ }
        }

        // Subscribe to Firebase-initiated token rotations. The plugin
        // fires this whenever FCM regenerates the registration token
        // (periodically by Firebase, after app data clear, etc.).
        try {
          tokenListener = await FirebaseMessaging.addListener(
            "tokenReceived",
            (event: { token: string }) => {
              if (cancelled) return;
              const next = event?.token;
              if (next) void registerToken(next);
            },
          );
          if (cancelled) await tokenListener?.remove();
        } catch { /* plugin not available */ }
      })();

      return () => {
        cancelled = true;
        tokenListener?.remove().catch(() => { /* already removed */ });
      };
    }

    // Web: classic feature detect.
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermissionState);

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false));
  }, [user, registerToken]);

  const enable = useCallback(async () => {
    if (!user) {
      setError("Sign in to enable notifications.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        // Native path — Firebase Messaging plugin.
        const perm = await FirebaseMessaging.requestPermissions();
        setPermission(perm.receive as PermissionState);
        if (perm.receive !== "granted") {
          setError("Permission denied. Enable notifications for this app in Settings.");
          return;
        }
        const { token } = await FirebaseMessaging.getToken();
        if (!token) throw new Error("Couldn't get an FCM token from the OS");
        try { localStorage.setItem(NATIVE_TOKEN_KEY, token); } catch { /* non-fatal */ }
        const idToken = await user.getIdToken();
        const platform = Capacitor.getPlatform(); // "android" | "ios" | "web"
        const res = await fetch("/api/push/fcm/register", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ token, platform }),
        });
        if (!res.ok) throw new Error("Server rejected FCM token");
        setSubscribed(true);
        return;
      }

      // Web path — Web Push.
      if (!supported) {
        setError("This device doesn't support push notifications.");
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        setError("Server isn't configured for push (missing VAPID key).");
        return;
      }
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== "granted") {
        setError("Permission denied. Re-enable in browser settings.");
        return;
      }
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        }));
      const idToken = await user.getIdToken();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Server rejected subscription");
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable notifications");
    } finally {
      setBusy(false);
    }
  }, [user, supported]);

  const disable = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        let token: string | null = null;
        try { token = localStorage.getItem(NATIVE_TOKEN_KEY); } catch { /* ignore */ }
        // Try to fetch fresh in case the cache was wiped.
        if (!token) {
          try {
            const got = await FirebaseMessaging.getToken();
            token = got.token ?? null;
          } catch { /* ignore */ }
        }
        try { await FirebaseMessaging.deleteToken(); } catch { /* ignore */ }
        if (token) {
          const idToken = await user.getIdToken();
          await fetch("/api/push/fcm/unregister", {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
        }
        try { localStorage.removeItem(NATIVE_TOKEN_KEY); } catch { /* ignore */ }
        setSubscribed(false);
        return;
      }

      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe();
      if (endpoint) {
        const idToken = await user.getIdToken();
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable notifications");
    } finally {
      setBusy(false);
    }
  }, [user]);

  return { supported, isNative, permission, subscribed, busy, error, enable, disable };
}

// VAPID public key arrives base64-url encoded. The Push API wants a
// Uint8Array. Standard conversion.
function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
