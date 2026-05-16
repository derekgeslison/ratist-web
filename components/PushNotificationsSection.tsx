"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, AlertCircle } from "lucide-react";
import { usePush } from "@/hooks/usePush";
import { useAuth } from "@/context/AuthContext";

/**
 * Settings-page surface for opting in to push notifications.
 *
 * Two transports, one UI:
 *   • Native Capacitor app → FCM (Firebase Cloud Messaging) push
 *   • Web browser / PWA install → Web Push (VAPID)
 * usePush hides the difference; this component just toggles enabled +
 * surfaces per-category preferences.
 *
 * The 6 push categories are independent from the in-app notification
 * preferences (which control the bell-icon feed). A user can leave a
 * category ON in-app but OFF for push — or vice versa.
 */

type PushCategory =
  | "commentOnContent"
  | "likeOnContent"
  | "commentReplies"
  | "commentLikes"
  | "milestones"
  | "watchlistInvites"
  | "follows"
  | "companionUpdates"
  | "streamingAlerts"
  | "movieClub"
  | "screeningRoom";

interface PushPrefs {
  commentOnContent: boolean;
  likeOnContent: boolean;
  commentReplies: boolean;
  commentLikes: boolean;
  milestones: boolean;
  watchlistInvites: boolean;
  follows: boolean;
  companionUpdates: boolean;
  streamingAlerts: boolean;
  movieClub: boolean;
  screeningRoom: boolean;
}

const DEFAULT_PREFS: PushPrefs = {
  commentOnContent: true,
  likeOnContent: true,
  commentReplies: true,
  commentLikes: true,
  milestones: true,
  watchlistInvites: true,
  follows: true,
  companionUpdates: true,
  streamingAlerts: true,
  movieClub: true,
  screeningRoom: true,
};

const PREF_GROUPS: {
  title: string;
  items: { key: PushCategory; label: string; desc: string }[];
}[] = [
  {
    title: "Engagement on your content",
    items: [
      { key: "commentOnContent", label: "Comments on your content", desc: "When someone comments on your reviews, posts, or community items" },
      { key: "likeOnContent", label: "Likes on your content", desc: "When someone likes your reviews or posts" },
      { key: "commentReplies", label: "Replies to your comments", desc: "When someone replies to a comment you made" },
      { key: "commentLikes", label: "Likes on your comments", desc: "When someone likes a comment you made" },
      { key: "milestones", label: "Milestone alerts", desc: "Big like / comment milestones on your content (50, 100, 500+)" },
    ],
  },
  {
    title: "People",
    items: [
      { key: "follows", label: "Follows & follow requests", desc: "When someone follows you, requests to follow, or accepts your follow request" },
      { key: "watchlistInvites", label: "Watchlist invites", desc: "When someone invites you to collaborate on a watchlist" },
    ],
  },
  {
    title: "Updates & releases",
    items: [
      { key: "companionUpdates", label: "Watch companion updates", desc: "When a new episode's companion is ready for a season you follow, or when a companion you requested is approved" },
      { key: "streamingAlerts", label: "Streaming alerts", desc: "When a movie or show you've subscribed to (or anything in your watchlist, if enabled) starts streaming" },
    ],
  },
  {
    title: "Movie Club",
    items: [
      { key: "movieClub", label: "Movie Club week updates", desc: "When voting opens, the week's pick is announced, or discussion opens. Membership is the opt-in — leaving the club stops the pings entirely." },
    ],
  },
  {
    title: "Screening Room",
    items: [
      { key: "screeningRoom", label: "Screening Room activity", desc: "Chat, polls, and pause requests during a screening you're in — sent only when the app is closed or backgrounded. Chat pings are throttled to once every 30 seconds; polls and pause requests aren't throttled. Mute via the in-room toggle still suppresses chat pings here." },
    ],
  },
];

export default function PushNotificationsSection() {
  const { user } = useAuth();
  const { supported, isNative, permission, subscribed, busy, error, enable, disable } = usePush();
  const [pushPrefs, setPushPrefs] = useState<PushPrefs>(DEFAULT_PREFS);

  // Load per-category push prefs from the user's profile.
  useEffect(() => {
    if (!user || !subscribed) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/profile/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.user?.pushPrefs && typeof data.user.pushPrefs === "object") {
          setPushPrefs((prev) => ({ ...prev, ...data.user.pushPrefs }));
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [user, subscribed]);

  async function togglePref(key: PushCategory, value: boolean) {
    if (!user) return;
    const next: PushPrefs = { ...pushPrefs, [key]: value };
    setPushPrefs(next); // optimistic
    try {
      const token = await user.getIdToken();
      await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pushPrefs: next }),
      });
    } catch {
      // Best-effort — leave the optimistic state in place.
    }
  }

  // iOS Safari (in a regular tab) can't receive Web Push — only the
  // installed-to-home-screen PWA can. Detect that specific case so we
  // can guide the user to install instead of just saying "unsupported".
  const isIOSSafariTab =
    !isNative &&
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
        {isNative
          ? "Get notified on this device when things happen on The Ratist."
          : "Get notified in your browser or installed PWA when things happen on The Ratist."}
      </p>

      {!supported && isIOSSafariTab && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-white mb-1">Add Ratist to your Home Screen first</p>
            <p className="text-xs text-[var(--foreground-muted)]">
              On iPhone, push only works when you&apos;ve installed the site as an app: tap the Share button in Safari, then &quot;Add to Home Screen&quot;. Open Ratist from that icon and come back here.
            </p>
          </div>
        </div>
      )}

      {!supported && !isIOSSafariTab && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--foreground-muted)]">
            {isNative
              ? "Push notifications aren't available on this device."
              : "This browser doesn't support push notifications. Try Chrome, Edge, or Firefox."}
          </p>
        </div>
      )}

      {supported && permission === "denied" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex gap-3 mb-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--foreground-muted)]">
            {isNative
              ? "You blocked notifications for this app. Re-enable them in your phone's Settings → Apps → The Ratist → Notifications."
              : "You blocked notifications for this site. Re-enable them in your browser's site settings, then refresh."}
          </p>
        </div>
      )}

      {supported && permission !== "denied" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">
                {subscribed
                  ? isNative ? "Enabled for this app" : "Enabled for this device"
                  : isNative ? "Not enabled for this app" : "Not enabled for this device"}
              </p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                {subscribed
                  ? "Pick which categories you want to be pushed about below. Your in-app notifications stay independent of these."
                  : "Tap to allow notifications. You can turn them off anytime."}
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
            <div className="mt-5 pt-5 border-t border-[var(--border)] space-y-5">
              {PREF_GROUPS.map((group) => (
                <div key={group.title} className="space-y-3">
                  <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    {group.title}
                  </p>
                  {group.items.map((row) => (
                    <label key={row.key} className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={pushPrefs[row.key]}
                        onChange={(e) => togglePref(row.key, e.target.checked)}
                        className="mt-1 accent-[var(--ratist-red)]"
                      />
                      <div>
                        <p className="text-sm text-white group-hover:text-[var(--ratist-red)] transition-colors">{row.label}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">{row.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </section>
  );
}
