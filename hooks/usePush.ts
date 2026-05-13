"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

// VAPID public key — base64-url encoded. Browsers need it converted to
// a Uint8Array before calling pushManager.subscribe.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

export interface UsePushState {
  /** True when navigator.serviceWorker AND Notification AND PushManager are all available. */
  supported: boolean;
  /** Current browser permission ("default" = not yet asked). */
  permission: PermissionState;
  /** True if this browser is currently subscribed. */
  subscribed: boolean;
  /** Becomes true while subscribe/unsubscribe is in flight. */
  busy: boolean;
  /** Last error from a subscribe/unsubscribe call. */
  error: string | null;
  /** Request permission + subscribe + POST to /api/push/subscribe. */
  enable: () => Promise<void>;
  /** Unsubscribe locally + POST to /api/push/unsubscribe. */
  disable: () => Promise<void>;
}

export function usePush(): UsePushState {
  const { user } = useAuth();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect support + permission + existing subscription on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
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
  }, []);

  const enable = useCallback(async () => {
    if (!user) {
      setError("Sign in to enable notifications.");
      return;
    }
    if (!supported) {
      setError("This browser doesn't support push notifications.");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      setError("Server isn't configured for push (missing VAPID key).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
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

      const token = await user.getIdToken();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Server rejected subscription");
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable push");
    } finally {
      setBusy(false);
    }
  }, [user, supported]);

  const disable = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe();

      if (endpoint) {
        const token = await user.getIdToken();
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ endpoint }),
        });
      }
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable push");
    } finally {
      setBusy(false);
    }
  }, [user]);

  return { supported, permission, subscribed, busy, error, enable, disable };
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
