"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Megaphone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Announcement {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string;
  linkLabel: string;
  bgColor: string | null;
}

const LS_KEY = "ratist:dismissed-announcements";
// Pending list: dismissals the user clicked but whose server POST
// hasn't been confirmed yet. We retry these on every mount. Without
// this queue, a failed POST (auth blip, network hiccup, 5xx) used to
// be silently swallowed — the user would see the banner reappear on
// any other device until they eventually got a successful POST
// through. Now every failure stays queued and retries indefinitely.
const PENDING_KEY = "ratist:pending-announcement-dismissals";

function readJsonArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* private mode — best effort */
  }
}

function readLocalDismissals(): string[] {
  return readJsonArray(LS_KEY);
}

function writeLocalDismissal(id: string) {
  const ids = readLocalDismissals();
  if (!ids.includes(id)) {
    ids.push(id);
    writeJsonArray(LS_KEY, ids);
  }
}

function readPending(): string[] {
  return readJsonArray(PENDING_KEY);
}

function addPending(id: string) {
  const ids = readPending();
  if (!ids.includes(id)) {
    ids.push(id);
    writeJsonArray(PENDING_KEY, ids);
  }
}

function removePending(id: string) {
  const ids = readPending().filter((x) => x !== id);
  writeJsonArray(PENDING_KEY, ids);
}

/** Post a single dismissal to the server. Returns true on 2xx, false
 *  on any failure (network, auth, server 5xx, etc.). Caller decides
 *  whether to leave the id in the pending queue or remove it. */
async function postDismissal(token: string, spotlightId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/me/spotlight-dismissals", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ spotlightId }),
    });
    if (!res.ok) {
      console.warn("[AnnouncementBanner] dismissal POST failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[AnnouncementBanner] dismissal POST threw", err);
    return false;
  }
}

export default function AnnouncementBanner() {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // On mount: drain the pending dismissal queue (retry POSTs that
  // failed on a prior visit) before deciding what banner to show.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const pending = readPending();
      if (pending.length === 0) return;
      let token: string;
      try { token = await user.getIdToken(); } catch { return; }
      for (const id of pending) {
        if (cancelled) return;
        const ok = await postDismissal(token, id);
        if (ok) removePending(id);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // localStorage is the always-on dismissal layer (works for
      // anonymous visitors and as a same-device fast path before the
      // server fetch resolves).
      const localIds = new Set(readLocalDismissals());

      // For signed-in users, also pull the cross-device dismissal
      // record so a desktop-dismissed banner doesn't reappear on
      // mobile sign-in. Anonymous visitors get an empty server set.
      let serverIds = new Set<string>();
      if (user) {
        try {
          const token = await user.getIdToken();
          const res = await fetch("/api/me/spotlight-dismissals", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            serverIds = new Set(data.ids ?? []);
          }
        } catch { /* fall back to local */ }
      }

      const dismissedIds = new Set([...localIds, ...serverIds]);

      try {
        // Pass auth token when signed in so the server can apply
        // audience filtering ("signed_in" / "non_subscriber" /
        // "new_user") and the effectiveForUsersBefore cutoff for
        // policy banners. Anonymous fetches still work but only
        // surface "everyone" + "signed_out" spotlights.
        const headers: HeadersInit = {};
        if (user) {
          try {
            const token = await user.getIdToken();
            headers["Authorization"] = `Bearer ${token}`;
          } catch { /* fall through with no auth */ }
        }
        const res = await fetch("/api/admin/spotlights", { headers });
        const data = await res.json();
        if (cancelled) return;
        const announcements = (data.spotlights ?? []).filter(
          (s: { type: string; id: string }) => s.type === "announcement" && !dismissedIds.has(s.id),
        );
        if (announcements.length > 0) setAnnouncement(announcements[0]);
      } catch { /* silent — banner just won't render */ }
    })();
    return () => { cancelled = true; };
  }, [user]);

  async function dismiss() {
    if (!announcement) return;
    const id = announcement.id;
    // Always write localStorage immediately — same-device dismissal
    // is the fast path that lets the banner disappear without
    // waiting for the network round-trip.
    writeLocalDismissal(id);
    setDismissed(true);

    // Signed-in users also persist server-side. If the POST fails
    // (auth blip, server 5xx, anything), we keep the id on the
    // pending queue and retry on every subsequent mount until it
    // succeeds. This fixes the silent-loss bug where a single failed
    // POST used to leave the user with no cross-device record at all.
    if (user) {
      addPending(id);
      try {
        const token = await user.getIdToken();
        const ok = await postDismissal(token, id);
        if (ok) removePending(id);
      } catch {
        // Token fetch failed — leave in pending, retry next mount.
      }
    }
  }

  if (!announcement || dismissed) return null;

  return (
    <div className="text-white" style={{ backgroundColor: announcement.bgColor || "var(--ratist-red)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Megaphone className="w-4 h-4 shrink-0" />
          <p className="text-sm font-medium truncate">
            {announcement.title}
            {announcement.description && <span className="hidden sm:inline text-white/80"> — {announcement.description}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {announcement.linkUrl && (
            <Link href={announcement.linkUrl} className="text-xs font-semibold underline hover:no-underline whitespace-nowrap">
              {announcement.linkLabel}
            </Link>
          )}
          <button onClick={dismiss} className="p-0.5 hover:bg-white/20 rounded transition-colors" title="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
