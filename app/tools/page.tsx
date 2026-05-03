import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import path from "node:path";
import fs from "node:fs";
import { Wrench, Users, Film, Map, Swords, BarChart3, Sparkles, MonitorPlay, TrendingUp } from "lucide-react";
import AdUnit from "@/components/AdUnit";
import BackstagePassBadge from "@/components/BackstagePassBadge";
import { getTopGrossing } from "@/lib/box-office-queries";

export const metadata: Metadata = {
  title: "Cinephile Tools",
  description: "Tools for movie fans: shared cast between films, actor filmography lookups, personal rankings, AI-powered recommendations, Oscar predictions, and screening room hosting.",
  alternates: { canonical: "/tools" },
};

export const dynamic = "force-dynamic";

type IconComp = React.ComponentType<{ className?: string }>;

interface Tool {
  href: string;
  icon: IconComp;
  title: string;
  desc: string;
  /** Static image path under /public (e.g. "/tools/shared-cast.png"). 16:9 aspect. */
  image?: string;
  /** Real-data preview JSX. Takes precedence over `image`. */
  preview?: React.ReactNode;
  premium?: boolean;
  /** Hex or CSS color used in the gradient fallback when no image/preview exists yet. */
  fallbackTint?: string;
}

// Real-data preview component for the Box Office card. Renders a
// poster strip of the current top-3 highest-grossing films. Stays
// inline in this file because it's only used here.
function BoxOfficeStrip({ movies }: { movies: { tmdbId: number; title: string; posterPath: string | null }[] }) {
  const items = movies.filter((m) => m.posterPath).slice(0, 3);
  if (items.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-transparent">
        <TrendingUp className="w-12 h-12 text-emerald-400/60" />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-transparent">
      {/* Stacked, slightly-overlapping poster strip; tilts give it a
          collected/leaderboard feel rather than a flat row. */}
      <div className="absolute inset-0 flex items-center justify-center gap-2 p-4">
        {items.map((m, i) => (
          <div
            key={m.tmdbId}
            className="relative h-[80%] aspect-[2/3] rounded-md overflow-hidden ring-1 ring-white/10 shadow-xl shrink-0"
            style={{
              transform: `translateY(${i === 1 ? "-6px" : "4px"}) rotate(${i === 0 ? "-4deg" : i === 2 ? "4deg" : "0deg"})`,
              zIndex: i === 1 ? 2 : 1,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://image.tmdb.org/t/p/w300${m.posterPath}`}
              alt={m.title}
              className="w-full h-full object-cover"
            />
            {/* Rank badge */}
            <span className="absolute top-1 left-1 text-[10px] font-bold text-white bg-emerald-500/90 px-1.5 py-0.5 rounded">
              #{i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Resolves a /public-relative path to a filesystem path under the
// running app, so we can check whether a Photoshop deliverable exists
// yet. When the file is missing, the card falls back to the gradient
// + icon — better than a broken-image icon during rollout.
function imageExists(publicPath: string): boolean {
  try {
    const abs = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

export default async function ToolsPage() {
  const topGrossing = await getTopGrossing(3).catch(() => []);

  const TOOLS: Tool[] = [
    {
      href: "/tools/shared-cast",
      icon: Users,
      title: "Shared Cast & Crew",
      desc: "Select 2–4 movies or shows to find actors and directors they share, or select 2–6 people to find titles they share. Filter by minimum overlap.",
      image: "/tools/shared-cast.png",
      fallbackTint: "rgb(96 165 250 / 0.2)", // blue-400
    },
    {
      href: "/tools/actor-lookup",
      icon: Film,
      title: "What Else Do I Know Them From?",
      desc: "Search an actor or director and see only the movies and shows you've personally seen or rated.",
      image: "/tools/actor-lookup.png",
      fallbackTint: "rgb(192 132 252 / 0.2)", // purple-400
    },
    {
      href: "/posts?type=MOVIE_MAP",
      icon: Map,
      title: "Movie Maps",
      desc: "Visual plot maps for complex, hard-to-follow films. Perfect for Nolan, Lynch, Kaufman, and other mind-bending directors.",
      image: "/tools/movie-maps.png",
      fallbackTint: "rgb(74 222 128 / 0.2)", // green-400
    },
    {
      href: "/tools/matchup",
      icon: Swords,
      title: "The Matchup",
      desc: "Pick two movies or shows and compare them head-to-head across every Ratist rating category. Let the data settle the debate.",
      image: "/tools/matchup.png",
      fallbackTint: "rgb(248 113 113 / 0.2)", // red-400
    },
    {
      href: "/tools/recommend",
      icon: Sparkles,
      title: "What Should I Watch?",
      desc: "Answer a few quick questions about your mood, preferred era, and runtime — and get personalized movie and TV show recommendations.",
      image: "/tools/recommend.png",
      fallbackTint: "rgb(244 114 182 / 0.2)", // pink-400
    },
    {
      href: "/screening-room",
      icon: MonitorPlay,
      title: "Screening Room",
      desc: "Watch movies or shows with friends remotely. Predict plots, react in real-time, run polls, and compare ratings when the credits roll.",
      image: "/tools/screening-room.png",
      fallbackTint: "rgb(168 85 247 / 0.2)", // purple-500
    },
    {
      href: "/box-office",
      icon: TrendingUp,
      title: "Box Office Insights",
      desc: "Lifetime gross leaderboards: highest grossing, biggest profit, best ROI, biggest bombs, top of the year. Plus a fully filterable list across every tracked title.",
      preview: <BoxOfficeStrip movies={topGrossing} />,
      fallbackTint: "rgb(52 211 153 / 0.2)", // emerald-400
    },
    {
      href: "/tools/collections",
      icon: Sparkles,
      title: "Collections",
      desc: "Curated movie lists from admins, the community, and people you follow. Each one is scored against your personal taste so you spot what's actually worth your time. Build your own and share them.",
      image: "/tools/collections.png",
      fallbackTint: "rgb(251 146 60 / 0.2)", // orange-400
      // Featured collections are publicly browsable now — Backstage Pass
      // unlocks the rest (Match scoring, building your own, etc.) once
      // the user actually opens the surface.
    },
    {
      href: "/tools/analytics",
      icon: BarChart3,
      title: "My Analytics",
      desc: "Deep insights into your viewing habits. Genre breakdowns, director/actor affinities, rating trends, contrarian score, and custom reports.",
      image: "/tools/analytics.png",
      fallbackTint: "rgb(244 63 94 / 0.2)", // rose-400
      premium: true,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Wrench className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Cinephile Tools</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-8">
        A working toolkit for movie fans — actors and directors across films, mood-driven recommendations, head-to-head matchups, plot maps, awards predictions, box-office leaderboards, and a Screening Room for watching together.
      </p>

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOOLS ?? ""} format="auto" className="mb-6" />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map((tool, idx) => {
          const Icon = tool.icon;
          // Tiles above the fold (3 on desktop, 2 on tablet, 1 on mobile)
          // get priority loading. With `images.unoptimized: true` in
          // next.config.ts the PNGs are served raw — without `priority`
          // they sit behind lazy-loading and the user sees broken-image
          // chrome until each one finishes downloading.
          const isAboveFold = idx < 3;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)] transition-colors group flex flex-col"
            >
              {/* Visual area — 16:9. Order of preference: real-data
                  preview > Photoshop image > gradient + large icon
                  fallback. Image rendering uses Next/Image so missing
                  files don't crash the page (404 → broken-image icon
                  is still better than no card). */}
              <div className="relative aspect-video bg-[var(--surface-2)] overflow-hidden">
                {tool.preview ? (
                  tool.preview
                ) : tool.image && imageExists(tool.image) ? (
                  <Image
                    src={tool.image}
                    alt={tool.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                    priority={isAboveFold}
                    loading={isAboveFold ? "eager" : "lazy"}
                  />
                ) : (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{
                      background: `radial-gradient(ellipse at center, ${tool.fallbackTint ?? "rgb(204 0 51 / 0.2)"}, transparent 70%)`,
                    }}
                  >
                    <Icon className="w-12 h-12 text-white/70" />
                  </div>
                )}

                {/* Icon chip in the top-left so the tool's identity
                    reads at a glance even when the image is illustrative */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1">
                  <Icon className="w-3.5 h-3.5 text-[var(--ratist-red)]" />
                </div>

                {tool.premium && (
                  <div className="absolute top-2 right-2">
                    <BackstagePassBadge />
                  </div>
                )}
              </div>

              {/* Text area */}
              <div className="p-5 flex-1 flex flex-col">
                <h2 className="text-base font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors mb-2">
                  {tool.title}
                </h2>
                <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{tool.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
