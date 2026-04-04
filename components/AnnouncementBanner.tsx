"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Megaphone } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string;
  linkLabel: string;
}

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check localStorage for dismissed announcements
    const dismissedIds = JSON.parse(localStorage.getItem("ratist:dismissed-announcements") ?? "[]");

    fetch("/api/admin/spotlights")
      .then((r) => r.json())
      .then((data) => {
        const announcements = (data.spotlights ?? []).filter(
          (s: { type: string; id: string }) => s.type === "announcement" && !dismissedIds.includes(s.id)
        );
        if (announcements.length > 0) setAnnouncement(announcements[0]);
      })
      .catch(() => {});
  }, []);

  function dismiss() {
    if (!announcement) return;
    const dismissedIds = JSON.parse(localStorage.getItem("ratist:dismissed-announcements") ?? "[]");
    dismissedIds.push(announcement.id);
    localStorage.setItem("ratist:dismissed-announcements", JSON.stringify(dismissedIds));
    setDismissed(true);
  }

  if (!announcement || dismissed) return null;

  return (
    <div className="bg-[var(--ratist-red)] text-white">
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
