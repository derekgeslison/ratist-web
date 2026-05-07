import type { Metadata } from "next";
import path from "node:path";
import fs from "node:fs";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, BarChart3, Ticket, Film, Users, Calendar, TrendingUp,
  Compass, Sparkles, Activity,
} from "lucide-react";
import BackstagePassCTA from "@/components/BackstagePassCTA";

export const metadata: Metadata = {
  title: "My Analytics — Backstage Pass",
  description: "A mirror for your viewing life. Genre patterns, decade affinities, director loyalties, and a contrarian score that tells you how often you disagree with the crowd.",
  alternates: { canonical: "/backstage-pass/analytics" },
};

export const dynamic = "force-dynamic";

interface Asset { src: string; w: number; h: number }
// Update w/h once captures land so each renders at its natural
// aspect (Screening Room / Custom Themes pattern).
const ASSETS: { hero: Asset; detail: Asset } = {
  hero:   { src: "/backstage-pass/analytics-hero.png",   w: 1566, h: 1083 },
  detail: { src: "/backstage-pass/analytics-detail.png", w: 1514, h: 1411 },
};

function imageExists(publicPath: string): boolean {
  try {
    const abs = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

const FEATURES: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }[] = [
  { icon: Compass,    title: "Patterns over time",    desc: "See how your taste's shifted month by month, year by year." },
  { icon: Activity,   title: "Contrarian score",      desc: "How often you disagree with the community average. The bigger the gap, the louder your voice." },
  { icon: Sparkles,   title: "Genre blind spots",     desc: "Genres you've barely touched — surfaced so you can fill the gaps if you want to." },
  { icon: Users,      title: "Director & actor affinities", desc: "The names that consistently show up in your highest-rated films." },
  { icon: Calendar,   title: "Decade fingerprint",    desc: "Are you a classics fan, a 90s loyalist, a stream-the-new-stuff watcher? The chart tells." },
  { icon: TrendingUp, title: "Custom reports",        desc: "Filter your viewing by genre, decade, director — generate a slice of your data and share it." },
];

export default function AnalyticsFeaturePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
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
            <BarChart3 className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">My Analytics</h1>
            <p className="text-xs text-[var(--foreground-muted)]">A mirror for your viewing life.</p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 bg-amber-400/15 border border-amber-400/40 rounded-full px-2.5 py-1">
          <Ticket className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pass</span>
        </span>
      </div>

      {/* ── Hero — primary analytics screenshot ───────────────────── */}
      <section className="mb-10">
        <AssetFrame asset={ASSETS.hero} kind="image" alt="A view of My Analytics" />
      </section>

      {/* ── Live mini-chart preview grid ────────────────────────────
          The page's signature visual: 6 chart-shaped tiles rendered
          with sample data, each demonstrating one analytic dimension
          you'll get on your real dashboard. CSS-rendered so the
          variety reads instantly without loading any screenshots —
          same move as the Custom Themes preset gallery, but with
          charts instead of color tiles. */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2">What it shows you</p>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">Six dimensions of your viewing life — these previews use sample data, but your dashboard runs on the real thing.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ChartTile label="Top Genres" icon={Film} sub="Last 12 months">
            <GenreBars />
          </ChartTile>
          <ChartTile label="By Decade" icon={Calendar} sub="Where you live">
            <DecadeBars />
          </ChartTile>
          <ChartTile label="Rating Distribution" icon={BarChart3} sub="Your spread">
            <RatingHistogram />
          </ChartTile>
          <ChartTile label="Director Affinities" icon={Users} sub="Top names">
            <DirectorList />
          </ChartTile>
          <ChartTile label="Contrarian Score" icon={Compass} sub="vs. community">
            <ContrarianMeter />
          </ChartTile>
          <ChartTile label="Velocity" icon={Activity} sub="Movies per month">
            <Sparkline />
          </ChartTile>
        </div>
      </section>

      {/* ── Detail screenshot ────────────────────────────────────── */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2">A closer look</p>
        <AssetFrame asset={ASSETS.detail} kind="image" alt="A deeper view of My Analytics" />
      </section>

      {/* ── Feature list ──────────────────────────────────────────── */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-3">What you'll learn</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-start gap-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-amber-400/10 border border-amber-400/20 shrink-0">
                  <Icon className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="text-xs text-[var(--foreground-muted)] leading-snug mt-0.5">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ── */}
      <BackstagePassCTA featureName="My Analytics" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// ChartTile — uniform shell for each mini-chart in the preview grid.
// Header (icon + label + sub) on top, chart body below in a fixed-
// height area so the grid rows stay aligned regardless of which
// visualization renders inside.
// ──────────────────────────────────────────────────────────────────

function ChartTile({
  label, icon: Icon, sub, children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-3.5 h-3.5 text-amber-400" />
        <p className="text-xs font-semibold text-white">{label}</p>
        <span className="ml-auto text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider">{sub}</span>
      </div>
      <div className="h-24 flex items-end">
        {children}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Sample-data mini visualizations. Numbers are illustrative — the
// real /tools/analytics dashboard pulls from the user's actual
// rating data. These exist just to show what shape the surfaces
// take so the marketing page reads as "you'll get this kind of
// thing about yourself" without leaning on screenshots.
// ──────────────────────────────────────────────────────────────────

function GenreBars() {
  const data = [
    { name: "Drama", count: 84 },
    { name: "Sci-Fi", count: 62 },
    { name: "Horror", count: 41 },
    { name: "Comedy", count: 28 },
  ];
  const max = Math.max(...data.map((d) => d.count));
  return (
    <div className="w-full space-y-1.5">
      {data.map((d) => (
        <div key={d.name} className="flex items-center gap-2 text-[10px]">
          <span className="text-[var(--foreground-muted)] w-12 truncate">{d.name}</span>
          <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
            <div className="h-full bg-amber-400/70 rounded-full" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <span className="text-[var(--foreground-muted)] w-6 text-right">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function DecadeBars() {
  const data = [
    { decade: "70s", count: 12 },
    { decade: "80s", count: 18 },
    { decade: "90s", count: 34 },
    { decade: "00s", count: 51 },
    { decade: "10s", count: 78 },
    { decade: "20s", count: 42 },
  ];
  const max = Math.max(...data.map((d) => d.count));
  return (
    <div className="w-full flex items-end gap-1">
      {data.map((d) => (
        <div key={d.decade} className="flex-1 flex flex-col items-center gap-1">
          {/* Fixed-height bar wrapper so the percentage on the bar
              inside actually resolves against pixels — matches the
              pattern used by the existing RatingDistribution chart. */}
          <div className="w-full flex flex-col justify-end h-16">
            <div
              className="w-full bg-amber-400/70 rounded-t"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: 2 }}
            />
          </div>
          <span className="text-[9px] text-[var(--foreground-muted)] leading-none">{d.decade}</span>
        </div>
      ))}
    </div>
  );
}

function RatingHistogram() {
  const counts = [1, 2, 3, 5, 8, 14, 22, 31, 18, 6]; // 1-10 buckets
  const max = Math.max(...counts);
  return (
    <div className="w-full flex items-end gap-1">
      {counts.map((c, i) => {
        const bucket = i + 1;
        const color = bucket <= 3 ? "bg-red-500/80" : bucket <= 5 ? "bg-orange-500/80" : bucket <= 7 ? "bg-yellow-500/80" : "bg-green-500/80";
        return (
          <div key={bucket} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col justify-end h-16">
              <div
                className={`w-full rounded-t ${color}`}
                style={{ height: `${(c / max) * 100}%`, minHeight: c > 0 ? 2 : 0 }}
              />
            </div>
            <span className="text-[8px] text-[var(--foreground-muted)] leading-none">{bucket}</span>
          </div>
        );
      })}
    </div>
  );
}

function DirectorList() {
  const data = [
    { name: "Denis Villeneuve", avg: 8.7 },
    { name: "Bong Joon-ho", avg: 8.4 },
    { name: "Greta Gerwig", avg: 8.1 },
  ];
  return (
    <div className="w-full space-y-1.5">
      {data.map((d) => (
        <div key={d.name} className="flex items-center justify-between text-[10px] gap-2">
          <span className="text-white truncate">{d.name}</span>
          <span className="text-amber-400 font-bold tabular-nums shrink-0">{d.avg.toFixed(1)}</span>
        </div>
      ))}
      <p className="text-[9px] text-[var(--foreground-muted)] pt-1">Avg across films you&apos;ve rated.</p>
    </div>
  );
}

function ContrarianMeter() {
  // Sample: 28% out-of-step with the community
  const score = 28;
  return (
    <div className="w-full flex flex-col items-center justify-center h-full">
      <div className="text-3xl font-extrabold text-amber-400 leading-none">{score}<span className="text-lg">%</span></div>
      <p className="text-[10px] text-[var(--foreground-muted)] mt-1">of your ratings break with the average</p>
      <div className="w-full max-w-[120px] mt-2 h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-amber-400 to-amber-400/40" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function Sparkline() {
  // 12 months of made-up movies-per-month data
  const data = [4, 6, 5, 9, 12, 8, 11, 15, 10, 14, 17, 13];
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  // Build SVG path coordinates
  const w = 100;
  const h = 100;
  const stepX = w / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * h * 0.8 - h * 0.1;
    return `${x},${y}`;
  });
  const path = `M ${points.join(" L ")}`;
  const fillPath = `${path} L ${w},${h} L 0,${h} Z`;
  return (
    <div className="w-full h-full flex flex-col">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full flex-1" preserveAspectRatio="none">
        <path d={fillPath} fill="rgb(251 191 36 / 0.15)" />
        <path d={path} stroke="rgb(251 191 36)" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[9px] text-[var(--foreground-muted)] mt-1">
        <span>Jan</span>
        <span>Dec</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// AssetFrame — same shape as the rest of the Pass set.
// ──────────────────────────────────────────────────────────────────

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
