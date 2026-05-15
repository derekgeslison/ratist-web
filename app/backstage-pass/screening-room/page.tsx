import type { Metadata } from "next";
import path from "node:path";
import fs from "node:fs";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, MonitorPlay, Ticket, Users, MessageSquare, Vote,
  Bookmark, Star, Rewind, Play,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { posterUrl } from "@/lib/tmdb";
import { detectNativeAppFromHeaders } from "@/lib/detect-native-app";
import BackstagePassCTA from "@/components/BackstagePassCTA";

export const metadata: Metadata = {
  title: "Screening Room — Backstage Pass",
  description: "Watch movies with friends remotely. Synced playback, live chat, polls, and a verdict reveal when the credits roll.",
  alternates: { canonical: "/backstage-pass/screening-room" },
};

export const dynamic = "force-dynamic";

// Per-act asset paths + intrinsic dimensions. Each tile renders at
// the asset's actual aspect ratio so dense screenshots aren't either
// cropped (object-cover) or letterboxed into a 1:1 box (object-contain).
// Update w/h here whenever a new capture is dropped in. The
// imageExists() check still gates rendering so missing files fall
// back to the placeholder cleanly.
interface Asset { src: string; w: number; h: number }
const ASSETS: { lobby: Asset; watching: Asset; reveal1: Asset; reveal2: Asset } = {
  lobby:    { src: "/backstage-pass/screening-room-lobby.png",     w: 1040, h: 717 },
  watching: { src: "/backstage-pass/screening-room-watching.gif",  w: 480,  h: 480 },
  reveal1:  { src: "/backstage-pass/screening-room-reveal1.png",   w: 1467, h: 974 },
  reveal2:  { src: "/backstage-pass/screening-room-reveal2.png",   w: 1494, h: 1497 },
};

function imageExists(publicPath: string): boolean {
  try {
    const abs = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

function timeAgo(date: Date): string {
  const now = Date.now();
  const ms = now - date.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

const FEATURES: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; passOnly?: boolean }[] = [
  { icon: MonitorPlay, title: "Host live sessions", desc: "Spin up a room, drop the invite link, watch with friends or open it to the community.", passOnly: true },
  { icon: Play, title: "Synced playback", desc: "Play, pause, and scrub for everyone in the room — no group-text \"3, 2, 1, go\" needed." },
  { icon: Vote, title: "Polls & predictions", desc: "Drop a question mid-watch. Predict the twist before the reveal. Win when you're right." },
  { icon: Bookmark, title: "Bookmark moments", desc: "Tag the punchline, the jump scare, the shot that broke you. Jump back to it after." },
  { icon: Star, title: "Group + individual verdicts", desc: "Everyone's ratings drop at once when the credits roll. Each one logs to your diary." },
  { icon: Rewind, title: "Chat with timestamps", desc: "Every message is anchored to the elapsed time, so post-watch you can jump back to the exact moment." },
];

interface TopMovie {
  tmdbId: number | null;
  movieTitle: string | null;
  posterPath: string | null;
  count: number;
}

export default async function ScreeningRoomFeaturePage() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const initialIsNative = await detectNativeAppFromHeaders();

  // Live snapshot. All queries individually .catch() so a transient
  // DB blip on one renders zeros instead of 500-ing the page.
  const [
    roomsLastWeek,
    uniqueMoviesAllTime,
    ratingsLogged,
    topMovies,
  ] = await Promise.all([
    prisma.screeningSession.count({
      where: { createdAt: { gte: weekAgo } },
    }).catch(() => 0),
    // Distinct movies ever screened. Using groupBy for accuracy —
    // count of distinct tmdbId rows on screening_sessions.
    prisma.screeningSession.groupBy({
      by: ["tmdbId"],
      where: { tmdbId: { not: null } },
    }).then((rows) => rows.length).catch(() => 0),
    prisma.screeningRating.count().catch(() => 0),
    // "Most-screened lately" — aggregate, not session-level, so no
    // host/participant identity leaks onto a public marketing page.
    prisma.screeningSession.groupBy({
      by: ["tmdbId", "movieTitle", "posterPath"],
      where: { tmdbId: { not: null }, posterPath: { not: null }, createdAt: { gte: monthAgo } },
      _count: { _all: true },
      orderBy: { _count: { tmdbId: "desc" } },
      take: 6,
    }).then((rows): TopMovie[] => rows.map((r) => ({
      tmdbId: r.tmdbId,
      movieTitle: r.movieTitle,
      posterPath: r.posterPath,
      count: r._count._all,
    }))).catch((): TopMovie[] => []),
  ]);

  const hasAnyCounter = roomsLastWeek > 0 || uniqueMoviesAllTime > 0 || ratingsLogged > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link */}
      <Link
        href="/backstage-pass"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-amber-400 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Backstage Pass
      </Link>

      {/* Identity row */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-amber-400/10 border border-amber-400/30">
            <MonitorPlay className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">Screening Room</h1>
            <p className="text-xs text-[var(--foreground-muted)]">Live, synced watch parties — from your couch.</p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 bg-amber-400/15 border border-amber-400/40 rounded-full px-2.5 py-1">
          <Ticket className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pass</span>
        </span>
      </div>

      {/* ── Three-act hero — Before / During / After ────────────────
          Three vertical rows rather than a horizontal trio: at 1:1
          aspect the side-by-side layout shrunk each capture to ~210px,
          which made screenshot text unreadable. Stacking gives each
          act the full content width, so a single capture sits at
          ~520px square on desktop and the After pair at ~256px each.
          The Before → During → After arc still reads top-to-bottom. */}
      <section className="mb-6 space-y-4">
        <ActRow
          tag="Before"
          title="Lobby"
          caption="Pick the movie, drop the invite link, wait for friends to file in."
          assets={[ASSETS.lobby]}
          kind="image"
        />
        <ActRow
          tag="During"
          title="Watching together"
          caption="Synced playback. Chat in the margins. Polls when it gets weird."
          assets={[ASSETS.watching]}
          kind="gif"
          emphasis
        />
        <ActRow
          tag="After"
          title="The reveal"
          caption="Everyone's ratings drop at once. Compare takes. Log to your diary."
          assets={[ASSETS.reveal1, ASSETS.reveal2]}
          kind="image"
        />
      </section>


      {/* Tagline strap under the trio */}
      <p className="text-center text-sm sm:text-base text-[var(--foreground-muted)] mb-10 max-w-xl mx-auto">
        Sync the play button. Chat through the climax. Compare ratings when the credits roll.
      </p>

      {/* ── Live counters ── */}
      {hasAnyCounter && (
        <section className="mb-10 flex flex-wrap items-baseline justify-center gap-x-8 gap-y-3 text-sm">
          {roomsLastWeek > 0 && <Stat n={roomsLastWeek} label={`room${roomsLastWeek === 1 ? "" : "s"} this week`} />}
          {uniqueMoviesAllTime > 0 && <Stat n={uniqueMoviesAllTime} label={`movie${uniqueMoviesAllTime === 1 ? "" : "s"} screened together`} />}
          {ratingsLogged > 0 && <Stat n={ratingsLogged} label={`rating${ratingsLogged === 1 ? "" : "s"} logged from screenings`} />}
        </section>
      )}

      {/* ── What you can do ─────────────────────────────────────────
          Compact 2-column row format — different rhythm from Movie
          Club's badge grid so the two pages don't feel templated.
          Pass-only items get an amber chip so the gating is clear. */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-3">What you can do</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-start gap-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-amber-400/10 border border-amber-400/20 shrink-0">
                  <Icon className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    {f.passOnly && (
                      <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.5 rounded uppercase tracking-wider">Pass only</span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)] leading-snug mt-0.5">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Most-screened lately (aggregate, no PII) ──────────────── */}
      {topMovies.length > 0 && (
        <section className="mb-10">
          <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-3">
            What members are watching together
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
            {topMovies.map((m) => (
              <div key={`${m.tmdbId}-${m.movieTitle}`} className="group">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] mb-1.5">
                  {m.posterPath ? (
                    <Image
                      src={posterUrl(m.posterPath, "w185")}
                      alt={m.movieTitle ?? "Recently screened"}
                      fill
                      sizes="(max-width: 640px) 33vw, 16vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <MonitorPlay className="w-6 h-6 text-[var(--foreground-muted)] opacity-40" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[var(--foreground-muted)] line-clamp-1">
                  {m.count} session{m.count === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── CTA ── */}
      <BackstagePassCTA featureName="Screening Room" initialIsNative={initialIsNative} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Act row — one full-width row per act so each capture has room to
// be readable. The header (tag chip + title + caption) sits above
// the asset area. Single-asset rows render one centered 1:1 square
// capped at a comfortable max-width so the page doesn't bloat at
// large viewports. Two-asset rows (the After reveal) render the
// pair side-by-side at desktop and stacked on mobile, where two
// half-width 1:1s would each be too small to read.
// ──────────────────────────────────────────────────────────────────

function ActRow({
  tag, title, caption, assets, kind, emphasis,
}: {
  tag: string;
  title: string;
  caption: string;
  assets: Asset[];
  kind: "image" | "gif";
  emphasis?: boolean;
}) {
  return (
    <div className={`bg-[var(--surface)] border rounded-xl overflow-hidden ${emphasis ? "border-amber-400/40 shadow-[0_0_30px_-12px_rgba(251,191,36,0.4)]" : "border-[var(--border)]"}`}>
      <div className="px-4 sm:px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center bg-amber-400/15 border border-amber-400/40 rounded-full px-2 py-0.5">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">{tag}</span>
          </span>
          <h2 className="text-base sm:text-lg font-bold text-white">{title}</h2>
        </div>
        <p className="text-xs sm:text-sm text-[var(--foreground-muted)] leading-snug">{caption}</p>
      </div>

      {/* Asset area. Each frame renders at its capture's intrinsic
          aspect ratio — no forced shape. Multi-asset rows stack
          vertically rather than side-by-side because the captures
          can have different aspect ratios (e.g. reveal1 is 3:2 and
          reveal2 is 1:1) and side-by-side would mismatch heights. */}
      <div className="px-4 sm:px-5 pb-4 space-y-3 max-w-2xl mx-auto">
        {assets.map((a) => (
          <AssetFrame key={a.src} asset={a} kind={kind} alt={title} />
        ))}
      </div>
    </div>
  );
}

// Single asset frame — renders at the capture's intrinsic aspect
// ratio (width/height props on Next/Image carry the aspect through
// to layout). Falls back to a sized placeholder when the file isn't
// dropped yet so the row's overall shape stays consistent.
function AssetFrame({
  asset, kind, alt,
}: {
  asset: Asset;
  kind: "image" | "gif";
  alt: string;
}) {
  const exists = imageExists(asset.src);
  const filename = asset.src.split("/").pop();
  if (exists) {
    return (
      <Image
        src={asset.src}
        alt={alt}
        width={asset.w}
        height={asset.h}
        sizes="(max-width: 640px) 100vw, 672px"
        className="w-full h-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)]"
        unoptimized={kind === "gif"}
      />
    );
  }
  return (
    <div
      className="relative w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col items-center justify-center text-center px-4"
      style={{ aspectRatio: `${asset.w} / ${asset.h}` }}
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] mb-1">
        {kind === "gif" ? "GIF goes here" : "Image goes here"}
      </p>
      <p className="text-[10px] text-[var(--foreground-muted)] leading-snug break-all">
        <code className="text-[var(--foreground-muted)]">{filename}</code>
      </p>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xl font-bold text-amber-400">{n.toLocaleString()}</span>
      <span className="text-[var(--foreground-muted)]">{label}</span>
    </div>
  );
}
