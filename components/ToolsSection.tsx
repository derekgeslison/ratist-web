"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  GitFork, Sparkles, TrendingUp, Brain,
  MonitorPlay, Swords, MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Tool {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}

// Default 4-up showcase. Order matters — earlier entries are kept
// first when filtering against overlap with the dynamic action tiles.
// Descriptions are kept in sync with the canonical copy on /tools.
// If you tweak one there, mirror it here (and vice versa) — diverging
// copy looks careless when a user clicks through.
const DEFAULT_TOOLS: Tool[] = [
  {
    icon: GitFork,
    title: "Shared Cast & Crew",
    description: "Select 2–4 movies or shows to find actors and directors they share, or select 2–6 people to find titles they share. Filter by minimum overlap.",
    href: "/tools/shared-cast",
  },
  {
    icon: Sparkles,
    title: "What Should I Watch?",
    description: "Answer a few quick questions about your mood, preferred era, and runtime — and get personalized movie and TV show recommendations.",
    href: "/tools/recommend",
  },
  {
    icon: TrendingUp,
    title: "Box Office Insights",
    description: "Lifetime gross leaderboards: highest grossing, biggest profit, best ROI, biggest bombs, top of the year. Plus a fully filterable list across every tracked title.",
    href: "/box-office",
  },
  {
    icon: Brain,
    title: "Cine-Q Trivia",
    description: "Daily movie trivia with weighted difficulty scoring. Climb the leaderboard, earn badges, and prove you really know your cinema.",
    href: "/community/cineq",
  },
];

// Reserve pool used to fill the section when one (or more) of the
// defaults is already promoted to a dynamic action tile up top. Order
// = priority — Screening Room first, then Matchup, then Forum.
const RESERVE: Tool[] = [
  {
    icon: MonitorPlay,
    title: "Screening Room",
    description: "Watch movies or shows with friends remotely. Predict plots, react in real-time, run polls, and compare ratings when the credits roll.",
    href: "/screening-room",
  },
  {
    icon: Swords,
    title: "The Matchup",
    description: "Pick two movies or shows and compare them head-to-head across every Ratist rating category. Let the data settle the debate.",
    href: "/tools/matchup",
  },
  {
    icon: MessageSquare,
    title: "Forum",
    description: "Discuss films and shows with the community — threads, debates, polls, and theories.",
    href: "/forum",
  },
];

interface Pick { href: string }

/**
 * Tools & Features showcase on the home page. Renders four default
 * cards by default; when the dynamic action-tile API surfaces a tool
 * the viewer is already engaged with (e.g. /tools/recommend in the
 * top-3 above), we swap that card out for the next unrepresented
 * entry from RESERVE so the home page doesn't double up on the same
 * destination.
 *
 * Anonymous / pre-fetch state: renders DEFAULT_TOOLS unchanged.
 */
export default function ToolsSection() {
  const { user } = useAuth();
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

  let tools = DEFAULT_TOOLS;
  if (picks && picks.length > 0) {
    const pickedHrefs = new Set(picks.map((p) => p.href));
    const keep = DEFAULT_TOOLS.filter((t) => !pickedHrefs.has(t.href));
    const reserveFiltered = RESERVE.filter(
      (r) => !pickedHrefs.has(r.href) && !keep.some((k) => k.href === r.href),
    );
    tools = [...keep, ...reserveFiltered].slice(0, 4);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Tools &amp; Features</h2>
        <Link href="/tools" className="text-sm text-[var(--ratist-red)] hover:underline font-medium">
          View all tools &rarr;
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tools.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--ratist-red)] transition-colors group flex flex-col gap-3"
            >
              <Icon className="w-6 h-6 text-[var(--ratist-red)]" />
              <div className="flex-1">
                <p className="text-white font-bold text-sm mb-1">{t.title}</p>
                <p className="text-[var(--foreground-muted)] text-sm leading-relaxed">{t.description}</p>
              </div>
              <span className="text-[var(--ratist-red)] text-sm font-semibold group-hover:underline">
                Explore &rarr;
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
