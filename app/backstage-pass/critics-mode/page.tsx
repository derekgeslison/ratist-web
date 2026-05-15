import type { Metadata } from "next";
import path from "node:path";
import fs from "node:fs";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, Star, Mic, Newspaper, Ticket, Lock,
  Bookmark, Clock, Repeat, MessageSquare, FileText, Award, Scale,
} from "lucide-react";
import { detectNativeAppFromHeaders } from "@/lib/detect-native-app";
import BackstagePassCTA from "@/components/BackstagePassCTA";

export const metadata: Metadata = {
  title: "Critics Mode & Live Review — Backstage Pass",
  description: "Capture your reactions scene-by-scene with Live Review. Earn Critics Mode at 250 full Ratist reviews and write at the depth your takes deserve.",
  alternates: { canonical: "/backstage-pass/critics-mode" },
};

export const dynamic = "force-dynamic";

interface Asset { src: string; w: number; h: number }
// Update the w/h once the captures land so the page renders at each
// asset's natural aspect ratio (same pattern as Screening Room and
// Custom Themes).
const ASSETS: { liveReview: Asset; criticsReview: Asset } = {
  liveReview:    { src: "/backstage-pass/live-review-timeline.gif", w: 480,  h: 480 },
  criticsReview: { src: "/backstage-pass/critics-mode-review.png",  w: 1328, h: 969 },
};

function imageExists(publicPath: string): boolean {
  try {
    const abs = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

const LIVE_REVIEW_FEATURES: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }[] = [
  { icon: Clock,        title: "Timestamped reactions",      desc: "Every note anchors to the elapsed playback time, so you can jump back to the exact moment later." },
  { icon: Bookmark,     title: "Standout-moment markers",    desc: "Bookmark the lines, shots, and twists you want to write about after the credits." },
  { icon: MessageSquare,title: "Reference notes for the review",desc: "Open your notes alongside the rubric so the moments stay fresh while you write — no scrubbing back through the movie." },
  { icon: Repeat,       title: "Works with both modes",      desc: "Use Live Review during a standard Ratist review or in Critics Mode once you unlock it." },
];

const CRITICS_FEATURES: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }[] = [
  { icon: FileText,     title: "Per-field commentary",       desc: "Write a paragraph next to every individual rating field. Show your work." },
  { icon: Newspaper,    title: "Category summaries",         desc: "Short essays for Story, Style, Emotive, Acting & Casting, and Pure Entertainment." },
  { icon: Award,        title: "Critics badge",              desc: "Reviews submitted in Critics Mode are marked with a distinguishing badge across the platform." },
  { icon: Scale,        title: "Carries more weight",        desc: "Critics-grade reviews factor more heavily into community averages than quick ratings." },
];

// The four steps a Pass-holder progresses through on the way to
// Critics Mode. Static counts so the page reads as a journey shape
// rather than a personalized progress bar — counts here are
// generic, not user-specific.
const PROGRESS: { count: number; label: string; final?: boolean }[] = [
  { count: 0,   label: "Start" },
  { count: 50,  label: "Warming up" },
  { count: 100, label: "Reviewer" },
  { count: 250, label: "Critics Mode", final: true },
];

export default async function CriticsModeFeaturePage() {
  const initialIsNative = await detectNativeAppFromHeaders();
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
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-amber-400/10 border border-amber-400/30">
            <Star className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">Critics Mode &amp; Live Review</h1>
            <p className="text-xs text-[var(--foreground-muted)]">Reviewer-grade depth — earned with the Pass.</p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 bg-amber-400/15 border border-amber-400/40 rounded-full px-2.5 py-1">
          <Ticket className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pass</span>
        </span>
      </div>

      {/* ── Stage 1 — Live Review ─────────────────────────────────── */}
      <section className="mb-12">
        <StageHeader
          number={1}
          icon={Mic}
          title="Live Review"
          chip="Included with Pass"
          chipIcon={Ticket}
        />
        <p className="text-sm text-[var(--foreground-muted)] mb-4 leading-relaxed">
          Capture your reactions as they happen. While the movie plays, drop notes, mark moments, and bookmark scenes — every one anchored to the timestamp it was made. When the credits roll, your live notes are already waiting in the review form.
        </p>

        {/* GIF — emphasized just like the middle act on Screening Room
           and the switching demo on Custom Themes. The "in motion"
           slot across the Pass set. */}
        <div className="rounded-xl border border-amber-400/40 shadow-[0_0_30px_-12px_rgba(251,191,36,0.4)] overflow-hidden bg-[var(--surface)] mb-4">
          <div className="max-w-lg mx-auto p-3 sm:p-4">
            <AssetFrame asset={ASSETS.liveReview} kind="gif" alt="Live Review timeline filling in scene-by-scene" />
          </div>
        </div>

        <FeatureList features={LIVE_REVIEW_FEATURES} />
      </section>

      {/* ── Stage 2 — Critics Mode ────────────────────────────────── */}
      <section className="mb-12">
        <StageHeader
          number={2}
          icon={Newspaper}
          title="Critics Mode"
          chip="250 Ratist reviews to unlock"
          chipIcon={Lock}
        />
        <p className="text-sm text-[var(--foreground-muted)] mb-4 leading-relaxed">
          Once you've submitted 250 full Ratist reviews — the full rating rubric, not quick ratings or imports — Critics Mode unlocks. Per-field commentary, category essays, the Critics badge, and heavier weight in community averages. The page makes itself longer because you've earned the room to think.
        </p>

        <CriticsProgress />

        {/* Long-form review screenshot — sized to its native aspect
           ratio. Best on a desktop crop where the prose-and-rubric
           two-column layout reads clearly. */}
        <div className="my-5">
          <AssetFrame asset={ASSETS.criticsReview} kind="image" alt="A real Critics Mode review" />
          <p className="text-[11px] text-[var(--foreground-muted)] text-center mt-2 italic">
            What a Critics Mode review looks like in the wild.
          </p>
        </div>

        <FeatureList features={CRITICS_FEATURES} />
      </section>

      {/* ── CTA ── */}
      <BackstagePassCTA featureName="Live Review and Critics Mode" initialIsNative={initialIsNative} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Stage header — the page's signature framing device. The set has
// just two stages, and that progression is the brand for this page
// (immediately useful → earned over time). Each header has a number,
// title, accent line, and an "availability chip" telling the user
// whether the stage is unlocked with the Pass or earned with reviews.
// ──────────────────────────────────────────────────────────────────

function StageHeader({
  number, icon: Icon, title, chip, chipIcon: ChipIcon,
}: {
  number: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  chip: string;
  chipIcon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Stage {number}</span>
        <span className="h-px w-6 bg-amber-400/30" />
        <span className="inline-flex items-center gap-1 bg-amber-400/15 border border-amber-400/40 rounded-full px-2 py-0.5">
          <ChipIcon className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">{chip}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-amber-400 shrink-0" />
        <h2 className="text-xl sm:text-2xl font-bold text-white">{title}</h2>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// CriticsProgress — generic milestone visualization. Not personalized
// (the page is publicly accessible without auth), so we draw the
// shape of the journey rather than where any specific user is on it.
// ──────────────────────────────────────────────────────────────────

function CriticsProgress() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-3">
      <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] font-semibold mb-4 text-center">
        Path to Critics Mode
      </p>
      <div className="relative">
        {/* Connector line — gradient toward amber so the destination
           reads as the bright endpoint of the journey. */}
        <div className="absolute top-4 left-4 right-4 h-px bg-gradient-to-r from-[var(--border)] via-amber-400/30 to-amber-400" />
        <div className="relative flex items-start justify-between">
          {PROGRESS.map((m, i) => (
            <div key={i} className="flex flex-col items-center text-center" style={{ width: `${100 / PROGRESS.length}%` }}>
              <div
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center ${
                  m.final
                    ? "bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.5)]"
                    : "bg-[var(--surface)] border border-[var(--border)]"
                }`}
              >
                {m.final ? (
                  <Star className="w-4 h-4 text-black fill-current" />
                ) : (
                  <span className="text-[10px] font-bold text-[var(--foreground-muted)]">{m.count}</span>
                )}
              </div>
              <p className={`text-[10px] mt-2 font-semibold ${m.final ? "text-amber-400" : "text-white"}`}>
                {m.label}
              </p>
              {m.count > 0 && !m.final && (
                <p className="text-[9px] text-[var(--foreground-muted)]">{m.count} reviews</p>
              )}
              {m.final && (
                <p className="text-[9px] text-[var(--foreground-muted)]">at 250</p>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[var(--foreground-muted)] text-center mt-5 leading-snug">
        Only full Ratist reviews count toward Critics Mode. Quick ratings and imported diary entries don&apos;t move the needle.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// FeatureList — compact 2-column rows. Same shape as Screening Room
// and Custom Themes so the rhythm stays consistent across the set.
// ──────────────────────────────────────────────────────────────────

function FeatureList({
  features,
}: {
  features: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }[];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {features.map((f) => {
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
  );
}

// ──────────────────────────────────────────────────────────────────
// AssetFrame — same as Screening Room / Custom Themes. Renders at
// the asset's intrinsic aspect ratio so dense screenshots aren't
// cropped or letterboxed.
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
