import type { Metadata } from "next";
import path from "node:path";
import fs from "node:fs";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, Clapperboard, ArrowRight, Vote, MessageCircle, Calendar,
  Trophy, Eye, Crown, AlertTriangle, Compass, FileText, Repeat,
  Sparkles, Bookmark, Award, Ticket,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { posterUrl } from "@/lib/tmdb";
import { getSuperlatives, type Superlative } from "@/lib/movie-club";
import { activeBackstageUserWhere } from "@/lib/subscription";
import BackstagePassCTA from "@/components/BackstagePassCTA";

export const metadata: Metadata = {
  title: "Movie Club — Backstage Pass",
  description: "A new movie every week, picked together, watched together, debated together. Movie Club is part of The Ratist's Backstage Pass.",
  alternates: { canonical: "/backstage-pass/movie-club" },
};

// Live data drives the hero + last-week wrap, so this page is
// per-request rather than build-time.
export const dynamic = "force-dynamic";

// Optional screenshot of the live /community/movie-club room. Path is
// checked at render time so the page renders cleanly before the asset
// lands — same fallback pattern used on /tools and the parent
// /backstage-pass surface. Drop a file at this path under /public to
// have it picked up automatically.
const ROOM_SCREENSHOT = "/backstage-pass/movie-club-room.png";
// Intrinsic dimensions of the capture — drives the slot's aspect
// ratio so the image renders at its native shape (no cropping or
// letterboxing). Matches the Screening Room / Custom Themes pattern.
const ROOM_W = 1392;
const ROOM_H = 1314;

function imageExists(publicPath: string): boolean {
  try {
    const abs = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

// Format a YYYY-MM-DD into a short Eastern-style label like "May 4".
function fmtShort(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pickMethodLabel(m: string): string {
  switch (m) {
    case "community_vote": return "Community Vote";
    case "random": return "Random Pick";
    case "admin": return "Admin Pick";
    default: return "Pick";
  }
}

// Compact icon picker for each superlative in the "Last Week's Wrap"
// card and the bottom roster. Falls back to Trophy if a future label
// isn't mapped — keeps the roster forward-compatible.
function superlativeIcon(label: string) {
  const l = label.toLowerCase();
  if (l.startsWith("first reviewer")) return Eye;
  if (l.startsWith("highest")) return Crown;
  if (l.startsWith("lowest")) return AlertTriangle;
  if (l.startsWith("in sync")) return Compass;
  if (l.startsWith("contrarian")) return AlertTriangle;
  if (l.startsWith("most detailed")) return FileText;
  if (l.startsWith("rewatcher")) return Repeat;
  if (l.startsWith("first-timer")) return Sparkles;
  if (l.startsWith("streaker")) return Award;
  if (l.startsWith("watchlist prophet")) return Bookmark;
  return Trophy;
}

const ROSTER: { label: string; desc: string }[] = [
  { label: "First Reviewer", desc: "First to submit." },
  { label: "Highest Rater", desc: "Loved it most." },
  { label: "Lowest Rater", desc: "Brutal honesty." },
  { label: "In Sync", desc: "Closest to the group avg." },
  { label: "Contrarian", desc: "Furthest from the group avg." },
  { label: "Most Detailed Review", desc: "Wrote the most." },
  { label: "Rewatchers", desc: "Already a fan." },
  { label: "First-Timer", desc: "Their first Movie Club." },
  { label: "Streaker", desc: "Three weeks in a row." },
  { label: "Watchlist Prophet", desc: "Saved it before the week was even announced." },
];

export default async function MovieClubFeaturePage() {
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  // Live snapshot. All queries individually .catch() so a transient
  // DB blip on one renders zeros instead of 500-ing the page.
  const [
    currentWeek,
    lastArchived,
    upcoming,
    memberCount,
    completedCount,
    reviewsLast4Weeks,
  ] = await Promise.all([
    prisma.movieClubWeek.findFirst({
      where: { status: { in: ["voting", "watching", "discussion"] } },
      orderBy: { startDate: "desc" },
      include: {
        movie: { select: { runtime: true } },
        _count: { select: { ratings: true, nominations: true } },
      },
    }).catch(() => null),
    prisma.movieClubWeek.findFirst({
      where: { status: "archived" },
      orderBy: { startDate: "desc" },
      include: { _count: { select: { ratings: true } } },
    }).catch(() => null),
    prisma.movieClubWeek.findMany({
      where: { status: "scheduled" },
      orderBy: { startDate: "asc" },
      take: 2,
      select: {
        id: true, weekNumber: true, startDate: true, pickMethod: true,
        pickTeaser: true, revealEarly: true,
        movieTitle: true, moviePoster: true, movieTmdbId: true,
      },
    }).catch(() => []),
    prisma.movieClubMember.count({ where: { user: activeBackstageUserWhere() } }).catch(() => 0),
    prisma.movieClubWeek.count({ where: { status: "archived" } }).catch(() => 0),
    prisma.movieClubRating.count({ where: { createdAt: { gte: fourWeeksAgo } } }).catch(() => 0),
  ]);

  const [currentAvg, lastAvg, lastSuperlatives] = await Promise.all([
    currentWeek
      ? prisma.movieClubRating.aggregate({
          where: { weekId: currentWeek.id },
          _avg: { rating: true },
        }).catch(() => null)
      : Promise.resolve(null),
    lastArchived
      ? prisma.movieClubRating.aggregate({
          where: { weekId: lastArchived.id },
          _avg: { rating: true },
        }).catch(() => null)
      : Promise.resolve(null),
    lastArchived ? getSuperlatives(lastArchived.id).catch(() => [] as Superlative[]) : Promise.resolve([] as Superlative[]),
  ]);

  // Hero shape. Three cases: live week (watching/discussion), voting
  // week (movie not picked yet), or no live week — fall back to the
  // first upcoming row. Each rendered differently below.
  const heroState: "live" | "voting" | "upcoming" | "empty" =
    currentWeek?.status === "watching" || currentWeek?.status === "discussion"
      ? "live"
      : currentWeek?.status === "voting"
        ? "voting"
        : upcoming.length > 0
          ? "upcoming"
          : "empty";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link */}
      <Link
        href="/backstage-pass"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-amber-400 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Backstage Pass
      </Link>

      {/* Identity row — kept compact since the hero below carries the
          page's visual weight. The amber Pass tag identifies this as
          a premium-feature page across the whole /backstage-pass set. */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-amber-400/10 border border-amber-400/30">
            <Clapperboard className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">Movie Club</h1>
            <p className="text-xs text-[var(--foreground-muted)]">A new film, picked and watched with the community, every week.</p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 bg-amber-400/15 border border-amber-400/40 rounded-full px-2.5 py-1">
          <Ticket className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pass</span>
        </span>
      </div>

      {/* ── Hero: this week's pick ── */}
      <section className="mb-8">
        {heroState === "live" && currentWeek && (
          <LiveHero
            week={currentWeek}
            avg={currentAvg?._avg.rating ?? null}
            ratingCount={currentWeek._count.ratings}
          />
        )}
        {heroState === "voting" && currentWeek && (
          <VotingHero
            week={currentWeek}
            nominationCount={currentWeek._count.nominations}
          />
        )}
        {heroState === "upcoming" && (
          <UpcomingHero week={upcoming[0]!} />
        )}
        {heroState === "empty" && (
          <EmptyHero />
        )}
      </section>

      {/* ── What members see — screenshot of /community/movie-club ──
          Renders at the capture's intrinsic aspect (no forced shape).
          Same AssetFrame pattern used by the other Pass pages. */}
      <section className="mb-8">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2">Inside the room</p>
        <div className="max-w-2xl mx-auto">
          {imageExists(ROOM_SCREENSHOT) ? (
            <Image
              src={ROOM_SCREENSHOT}
              alt="The Movie Club room — members view"
              width={ROOM_W}
              height={ROOM_H}
              sizes="(max-width: 640px) 100vw, 672px"
              className="w-full h-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
            />
          ) : (
            <div
              className="relative w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl overflow-hidden flex items-center justify-center text-center px-6"
              style={{ aspectRatio: `${ROOM_W} / ${ROOM_H}` }}
            >
              <p className="text-xs text-[var(--foreground-muted)]">
                Screenshot of /community/movie-club lands here. Save it as <code className="text-[var(--foreground-muted)]">/public{ROOM_SCREENSHOT}</code>.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Live stat strip ── */}
      {(memberCount > 0 || completedCount > 0 || reviewsLast4Weeks > 0) && (
        <section className="mb-10 flex flex-wrap items-baseline justify-center gap-x-8 gap-y-3 text-sm">
          {memberCount > 0 && <Stat n={memberCount} label="members" />}
          {reviewsLast4Weeks > 0 && <Stat n={reviewsLast4Weeks} label="reviews in the last 4 weeks" />}
          {completedCount > 0 && <Stat n={completedCount} label={`week${completedCount === 1 ? "" : "s"} completed`} />}
        </section>
      )}

      {/* ── How a week works — visual timeline ── */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-3">How a week works</p>
        <Timeline />
      </section>

      {/* ── Last Week's Wrap — anchors the page in real activity ── */}
      {lastArchived && lastArchived._count.ratings > 0 && (
        <section className="mb-10">
          <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-3">Last week</p>
          <LastWeekWrap
            week={lastArchived}
            avg={lastAvg?._avg.rating ?? null}
            superlatives={lastSuperlatives}
          />
        </section>
      )}

      {/* ── Coming Up — next 1-2 scheduled weeks ── */}
      {upcoming.length > 0 && heroState !== "upcoming" && (
        <section className="mb-10">
          <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-3">Coming up</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {upcoming.map((u) => <UpcomingCard key={u.id} week={u} />)}
          </div>
        </section>
      )}

      {/* ── Superlative roster ── */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-3">Ten ways to win the week</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ROSTER.map((s) => {
            const Icon = superlativeIcon(s.label);
            return (
              <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-start gap-2.5">
                <Icon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{s.label}</p>
                  <p className="text-[10px] text-[var(--foreground-muted)] leading-snug">{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ── */}
      <BackstagePassCTA featureName="Movie Club" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Hero variants
// ──────────────────────────────────────────────────────────────────

function LiveHero({
  week, avg, ratingCount,
}: {
  week: { weekNumber: number; startDate: string; endDate: string; status: string; pickMethod: string; movieTitle: string | null; moviePoster: string | null; movieTmdbId: number | null; movie: { runtime: number | null } | null };
  avg: number | null;
  ratingCount: number;
}) {
  const inDiscussion = week.status === "discussion";
  const tagText = inDiscussion ? "Discussion open" : "Watching now";
  const TagIcon = inDiscussion ? MessageCircle : Eye;

  return (
    <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
      {/* Soft amber glow behind the hero so it reads as the page's main
         beat. Subtle — doesn't compete with the poster. */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-amber-400/5 via-transparent to-transparent" />
      <div className="relative grid grid-cols-[120px_1fr] sm:grid-cols-[180px_1fr] gap-4 sm:gap-6 p-4 sm:p-5 items-center">
        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] shadow-lg">
          {week.moviePoster ? (
            <Image
              src={posterUrl(week.moviePoster, "w342")}
              alt={week.movieTitle ?? "This week's movie"}
              fill
              sizes="180px"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Clapperboard className="w-10 h-10 text-[var(--foreground-muted)] opacity-40" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-amber-400/15 border border-amber-400/40 rounded-full px-2 py-0.5">
              <TagIcon className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">{tagText}</span>
            </span>
            <span className="text-[11px] text-[var(--foreground-muted)]">
              Week {week.weekNumber} · {fmtShort(week.startDate)}–{fmtShort(week.endDate)}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-1">
            {week.movieTitle ?? "This week's pick"}
          </h2>
          <p className="text-xs text-[var(--foreground-muted)] mb-3">
            {pickMethodLabel(week.pickMethod)}
            {week.movie?.runtime ? ` · ${week.movie.runtime} min` : ""}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
            <Inline n={ratingCount} label={ratingCount === 1 ? "review so far" : "reviews so far"} />
            {avg != null && <Inline value={avg.toFixed(1)} label="avg" />}
          </div>
          <p className="text-xs text-[var(--foreground-muted)] mt-3">
            {inDiscussion
              ? "Discussion's live — members are weighing in right now."
              : "Watch on your own time. Discussion opens Friday at 8pm ET."}
          </p>
        </div>
      </div>
    </div>
  );
}

function VotingHero({
  week, nominationCount,
}: {
  week: { weekNumber: number; startDate: string; endDate: string; pickTeaser: string | null };
  nominationCount: number;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 bg-amber-400/15 border border-amber-400/40 rounded-full px-2 py-0.5">
          <Vote className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Voting open</span>
        </span>
        <span className="text-[11px] text-[var(--foreground-muted)]">
          Week {week.weekNumber} · {fmtShort(week.startDate)}–{fmtShort(week.endDate)}
        </span>
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-2">Members are picking the movie.</h2>
      <p className="text-sm text-[var(--foreground-muted)] mb-3">
        {nominationCount > 0
          ? `${nominationCount} nomination${nominationCount === 1 ? "" : "s"} on the ballot. Top pick wins by Tuesday night.`
          : "Nominations open through Tuesday — top pick wins."}
      </p>
      {week.pickTeaser && (
        <p className="text-xs italic text-[var(--foreground-muted)]">&ldquo;{week.pickTeaser}&rdquo;</p>
      )}
    </div>
  );
}

function UpcomingHero({
  week,
}: {
  week: { weekNumber: number; startDate: string; pickMethod: string; pickTeaser: string | null; revealEarly: boolean | null; movieTitle: string | null; moviePoster: string | null };
}) {
  const showMovie = week.revealEarly && week.movieTitle && week.moviePoster;
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 bg-amber-400/15 border border-amber-400/40 rounded-full px-2 py-0.5">
          <Calendar className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Coming up</span>
        </span>
        <span className="text-[11px] text-[var(--foreground-muted)]">
          Week {week.weekNumber} · starts {fmtShort(week.startDate)}
        </span>
      </div>
      {showMovie ? (
        <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[140px_1fr] gap-4 mt-3 items-center">
          <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
            <Image
              src={posterUrl(week.moviePoster!, "w342")}
              alt={week.movieTitle!}
              fill
              sizes="140px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-white leading-tight">{week.movieTitle}</h2>
            <p className="text-xs text-[var(--foreground-muted)] mt-1">{pickMethodLabel(week.pickMethod)}</p>
            {week.pickTeaser && (
              <p className="text-xs italic text-[var(--foreground-muted)] mt-2">&ldquo;{week.pickTeaser}&rdquo;</p>
            )}
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-2">
            Next week&apos;s pick is on the way.
          </h2>
          <p className="text-sm text-[var(--foreground-muted)]">
            {pickMethodLabel(week.pickMethod)} — revealed Monday morning.
          </p>
          {week.pickTeaser && (
            <p className="text-xs italic text-[var(--foreground-muted)] mt-2">&ldquo;{week.pickTeaser}&rdquo;</p>
          )}
        </>
      )}
    </div>
  );
}

function EmptyHero() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-center">
      <Clapperboard className="w-8 h-8 text-amber-400 mx-auto mb-3 opacity-70" />
      <h2 className="text-xl font-bold text-white mb-2">A new film, every week.</h2>
      <p className="text-sm text-[var(--foreground-muted)]">
        Members watch together. Reviews drop through the week. Friday at 8pm ET, the discussion goes live.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Last week's wrap
// ──────────────────────────────────────────────────────────────────

function LastWeekWrap({
  week, avg, superlatives,
}: {
  week: { weekNumber: number; startDate: string; endDate: string; movieTitle: string | null; moviePoster: string | null; _count: { ratings: number } };
  avg: number | null;
  superlatives: Superlative[];
}) {
  // Show 3 superlatives. Prefer the more "social" ones up top: First-
  // Timer, Streaker, Watchlist Prophet. Falls back to whatever exists
  // if those aren't present yet.
  const PREFERRED = ["First-Timer", "Streaker", "Watchlist Prophet", "Contrarian", "First Reviewer"];
  const ranked = [...superlatives].sort((a, b) => {
    const ai = PREFERRED.indexOf(a.label);
    const bi = PREFERRED.indexOf(b.label);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const top = ranked.slice(0, 3);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
      <div className="grid grid-cols-[80px_1fr] sm:grid-cols-[100px_1fr] gap-4 items-center">
        <div className="relative aspect-[2/3] rounded-md overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
          {week.moviePoster ? (
            <Image
              src={posterUrl(week.moviePoster, "w185")}
              alt={week.movieTitle ?? "Last week"}
              fill
              sizes="100px"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Clapperboard className="w-6 h-6 text-[var(--foreground-muted)] opacity-40" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider">
            Week {week.weekNumber} · {fmtShort(week.startDate)}–{fmtShort(week.endDate)}
          </p>
          <h3 className="text-base sm:text-lg font-bold text-white leading-tight">{week.movieTitle ?? "Last week's pick"}</h3>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            {week._count.ratings} review{week._count.ratings === 1 ? "" : "s"}
            {avg != null && <> · avg <span className="text-white font-semibold">{avg.toFixed(1)}</span></>}
          </p>
        </div>
      </div>

      {top.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {top.map((s, i) => {
            const Icon = superlativeIcon(s.label);
            return (
              <div key={i} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3.5 h-3.5 text-amber-400" />
                  <p className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold">{s.label}</p>
                </div>
                <p className="text-sm text-white truncate">{s.userName}</p>
                <p className="text-[10px] text-[var(--foreground-muted)] truncate">{s.value}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Upcoming card (small, used in the "Coming up" grid below the hero)
// ──────────────────────────────────────────────────────────────────

function UpcomingCard({
  week,
}: {
  week: { id: string; weekNumber: number; startDate: string; pickMethod: string; pickTeaser: string | null; revealEarly: boolean | null; movieTitle: string | null; moviePoster: string | null };
}) {
  const showMovie = week.revealEarly && week.movieTitle && week.moviePoster;
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
      <div className="relative w-12 h-18 shrink-0 rounded overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
        {showMovie ? (
          <Image
            src={posterUrl(week.moviePoster!, "w92")}
            alt={week.movieTitle!}
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Clapperboard className="w-4 h-4 text-[var(--foreground-muted)] opacity-40" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider">
          Week {week.weekNumber} · {fmtShort(week.startDate)}
        </p>
        <p className="text-sm font-semibold text-white truncate">
          {showMovie ? week.movieTitle : `${pickMethodLabel(week.pickMethod)} — revealed Mon`}
        </p>
        {!showMovie && week.pickTeaser && (
          <p className="text-[11px] italic text-[var(--foreground-muted)] truncate">&ldquo;{week.pickTeaser}&rdquo;</p>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// The Week timeline
// ──────────────────────────────────────────────────────────────────

function Timeline() {
  const STEPS = [
    { day: "Mon", label: "Reveal", desc: "Movie drops or voting opens." },
    { day: "Mon–Fri", label: "Watch + rate", desc: "On your own time." },
    { day: "Fri 8pm ET", label: "Discussion", desc: "Everything unlocks." },
    { day: "Sun", label: "Wrap", desc: "Superlatives, then next week's tease." },
  ];
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 sm:p-5">
      <ol className="grid grid-cols-1 sm:grid-cols-4 gap-y-4 sm:gap-x-3 relative">
        {STEPS.map((s, i) => (
          <li key={i} className="relative flex sm:flex-col items-start sm:items-center gap-3 sm:gap-2 sm:text-center">
            {/* Connector — only on sm+ between markers */}
            {i < STEPS.length - 1 && (
              <span className="hidden sm:block absolute top-3 left-[calc(50%+18px)] right-[calc(-50%+18px)] h-px bg-amber-400/30" />
            )}
            {/* Marker */}
            <span className="relative z-10 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400/20 border border-amber-400/50 shrink-0">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            </span>
            <div className="min-w-0 sm:w-full">
              <p className="text-[10px] text-amber-400 uppercase tracking-widest font-semibold">{s.day}</p>
              <p className="text-sm font-semibold text-white">{s.label}</p>
              <p className="text-[11px] text-[var(--foreground-muted)] leading-snug">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Tiny presentational helpers
// ──────────────────────────────────────────────────────────────────

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xl font-bold text-amber-400">{n.toLocaleString()}</span>
      <span className="text-[var(--foreground-muted)]">{label}</span>
    </div>
  );
}

function Inline({ n, value, label }: { n?: number; value?: string; label: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-base font-bold text-white">{value ?? n?.toLocaleString()}</span>
      <span className="text-xs text-[var(--foreground-muted)]">{label}</span>
    </span>
  );
}
