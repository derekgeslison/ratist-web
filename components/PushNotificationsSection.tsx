"use client";

import { useState } from "react";
import { Bell, BellOff, AlertCircle, Send } from "lucide-react";
import { usePush } from "@/hooks/usePush";
import { useAuth } from "@/context/AuthContext";

/**
 * Settings-page surface for opting in to Web Push. The push categories
 * mirror the in-app `notificationPrefs` toggles — if you've turned off
 * "Likes on your content" in-app, you also won't be pushed for it.
 * That gate lives in `lib/notifications.ts`.
 *
 * iOS quirk: Safari supports Web Push only when the site has been added
 * to the home screen as a PWA. On the regular Safari tab the API is
 * unsupported and we surface a hint pointing the user there.
 */
export default function PushNotificationsSection() {
  const { user } = useAuth();
  const { supported, permission, subscribed, busy, error, enable, disable } = usePush();
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function sendTest() {
    if (!user) return;
    setTestStatus("sending");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setTestStatus(res.ok ? "sent" : "error");
      setTimeout(() => setTestStatus("idle"), 3000);
    } catch {
      setTestStatus("error");
      setTimeout(() => setTestStatus("idle"), 3000);
    }
  }

  const isIOSSafariTab =
    typeof window !== "undefined" &&
    /iPhone|iPad|iPod/.test(window.navigator.userAgent) &&
    !("standalone" in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone);

  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
        {subscribed ? <Bell className="w-4 h-4 text-[var(--ratist-red)]" /> : <BellOff className="w-4 h-4" />}
        Push notifications
      </h2>
      <p className="text-sm text-[var(--foreground-muted)] mb-4">
        Get notified on this device for the same things that appear in your bell icon.
      </p>

      {!supported && isIOSSafariTab && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-white mb-1">Add Ratist to your Home Screen first</p>
            <p className="text-xs text-[var(--foreground-muted)]">
              On iPhone, Web Push only works when you&apos;ve installed the site as an app: tap the Share button in Safari, then &quot;Add to Home Screen&quot;. Open Ratist from that icon and come back here.
            </p>
          </div>
        </div>
      )}

      {!supported && !isIOSSafariTab && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--foreground-muted)]">
            This browser doesn&apos;t support push notifications.
          </p>
        </div>
      )}

      {supported && permission === "denied" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex gap-3 mb-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--foreground-muted)]">
            You previously blocked notifications. Re-enable them in your browser&apos;s site settings, then refresh this page.
          </p>
        </div>
      )}

      {supported && permission !== "denied" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">
                {subscribed ? "Enabled on this device" : "Not enabled on this device"}
              </p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                {subscribed
                  ? "You'll get push notifications matching your notification preferences below."
                  : "Click to allow notifications. You can turn them off anytime."}
              </p>
            </div>
            <button
              type="button"
              onClick={subscribed ? disable : enable}
              disabled={busy}
              className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full transition-colors disabled:opacity-60 ${
                subscribed
                  ? "bg-[var(--surface-2)] border border-[var(--border)] text-white hover:border-[var(--ratist-red)]"
                  : "bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white"
              }`}
            >
              {busy ? "…" : subscribed ? "Disable" : "Enable"}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-xs text-yellow-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
          {subscribed && (
            <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-3">
              <button
                type="button"
                onClick={sendTest}
                disabled={testStatus === "sending"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" /> Send test notification
              </button>
              {testStatus === "sent" && (
                <span className="text-xs text-green-400">Sent — check your notifications.</span>
              )}
              {testStatus === "error" && (
                <span className="text-xs text-yellow-400">Couldn&apos;t send. Check console.</span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
