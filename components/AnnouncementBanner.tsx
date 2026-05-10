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

function readLocalDismissals(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalDismissal(id: string) {
  try {
    const ids = readLocalDismissals();
    if (!ids.includes(id)) ids.push(id);
    localStorage.setItem(LS_KEY, JSON.stringify(ids));
  } catch {
    /* private mode — best effort */
  }
}

export default function AnnouncementBanner() {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

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
        const res = await fetch("/api/admin/spotlights");
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

  function dismiss() {
    if (!announcement) return;
    // Always write localStorage — both anon and signed-in users get
    // the same-device fast path on next visit.
    writeLocalDismissal(announcement.id);

    // Signed-in users also persist server-side. Fire-and-forget; the
    // localStorage write is enough to hide the banner immediately.
    if (user) {
      user.getIdToken().then((token) =>
        fetch("/api/me/spotlight-dismissals", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ spotlightId: announcement.id }),
        }).catch(() => { /* localStorage already covers this device */ })
      );
    }

    setDismissed(true);
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
