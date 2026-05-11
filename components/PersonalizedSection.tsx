"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bookmark, Eye, Star, ListOrdered, MessageSquare, Sparkles,
  Layers, MonitorPlay, Brain, Ticket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Pick {
  id: string;
  title: string;
  href: string;
  description: string;
}

// Icon + slot-label assignments stay client-side so we don't pay to
// ship the Lucide tree through an API response. Icons are matched to
// the Navbar source-of-truth so the home tile and the user menu agree.
const ICONS: Record<string, LucideIcon> = {
  ratings: Star,
  watchlist: Bookmark,
  diary: Eye,
  rankings: ListOrdered,
  forum: MessageSquare,
  recommend: Sparkles,
  collections: Layers,
  screening: MonitorPlay,
  cineq: Brain,
  movieClub: Ticket,
};

export default function PersonalizedSection() {
  const { user, loading } = useAuth();
  const [picks, setPicks] = useState<Pick[] | null>(null);

  useEffect(() => {
    if (!user) { setPicks(null); return; }
    let cancelled = false;
    user.getIdToken().then(async (token) => {
      const res = await fetch("/api/users/me/home-actions", {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (cancelled) return;
      if (res?.ok) {
        const data = await res.json();
        setPicks(data.picks ?? []);
      } else {
        setPicks([]);
      }
    });
    return () => { cancelled = true; };
  }, [user]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg mb-1">Your personal movie universe</h2>
          <p className="text-[var(--foreground-muted)] text-sm max-w-xl">
            Track what you&apos;ve seen, rate movies your way, and get recommendations built for your taste.
          </p>
        </div>
        <Link
          href="/auth/signin"
          className="shrink-0 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold text-sm px-5 py-2.5 rounded-full transition-colors"
        >
          Get Started
        </Link>
      </div>
    );
  }

  const displayName = user.displayName ?? user.email?.split("@")[0] ?? "there";

  // Slot labels mirror the previous static UX (welcome / up next) and
  // add a third "discover" slot that the API uses to surface an
  // under-engaged feature. Labels are positional, not per-feature, so
  // the rotating nudge always feels like a fresh suggestion.
  const SLOT_LABELS = [`Welcome back, ${displayName}`, "Up next", "Discover"];

  // While the API is in flight, render a skeleton with the same shape
  // as the resolved state so the home page doesn't jump.
  const list: Array<Pick | null> = picks ?? [null, null, null];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {list.map((p, i) => {
        const Icon = p ? (ICONS[p.id] ?? Sparkles) : Sparkles;
        const label = SLOT_LABELS[i] ?? "";
        if (!p) {
          return (
            <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 animate-pulse">
              <p className="text-[var(--foreground-muted)] text-xs uppercase tracking-widest mb-1">{label}</p>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded bg-[var(--surface-2)]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-32 rounded bg-[var(--surface-2)]" />
                  <div className="h-3 w-48 rounded bg-[var(--surface-2)]" />
                </div>
              </div>
            </div>
          );
        }
        return (
          <Link
            key={p.id}
            href={p.href}
            className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-xl p-5 transition-colors group"
          >
            <p className="text-[var(--foreground-muted)] text-xs uppercase tracking-widest mb-1">{label}</p>
            <div className="flex items-center gap-3">
              <Icon className="w-5 h-5 text-[var(--ratist-red)] shrink-0" />
              <div className="min-w-0">
                <p className="text-white font-semibold group-hover:text-[var(--ratist-red)] transition-colors">
                  {p.title}
                </p>
                <p className="text-xs text-[var(--foreground-muted)] line-clamp-2">
                  {p.description}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
