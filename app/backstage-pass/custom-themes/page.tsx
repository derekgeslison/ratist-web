import type { Metadata } from "next";
import path from "node:path";
import fs from "node:fs";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, Palette, Ticket, RefreshCw, ImagePlus, Eye, Sparkles, Star,
} from "lucide-react";
import { THEME_PRESETS, type ThemePreset } from "@/lib/themes";
import BackstagePassCTA from "@/components/BackstagePassCTA";

export const metadata: Metadata = {
  title: "Custom Themes — Backstage Pass",
  description: "Make your profile yours. Ten curated presets, full custom color controls, and an optional header image — switch anytime.",
  alternates: { canonical: "/backstage-pass/custom-themes" },
};

// Match the other Pass pages so imageExists() picks up newly-dropped
// captures on every request rather than baking the result at build.
export const dynamic = "force-dynamic";

interface Asset { src: string; w: number; h: number }
// Hero + GIF dimensions are placeholders until the captures land —
// update the w/h here once they're saved so the page renders at
// each asset's natural aspect ratio (same pattern as Screening Room).
const ASSETS: { hero: Asset; switching: Asset } = {
  hero:      { src: "/backstage-pass/theme-profile-hero.png", w: 1416, h: 547 },
  switching: { src: "/backstage-pass/theme-switching.gif",    w: 480,  h: 480 },
};

function imageExists(publicPath: string): boolean {
  try {
    const abs = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

// The six color variables a user can override. Default values come
// from the Default preset so the swatches show what the platform
// looks like out of the box.
const SWATCHES: { name: string; color: string; desc: string }[] = [
  { name: "Accent",      color: "#cc1034", desc: "Buttons, highlights, the rating ring." },
  { name: "Surface",     color: "#1a1a1a", desc: "The page background." },
  { name: "Surface 2",   color: "#242424", desc: "Cards, modals, raised UI." },
  { name: "Text",        color: "#f0f0f0", desc: "Primary readable text." },
  { name: "Muted",       color: "#a0a0a0", desc: "Secondary labels and meta." },
  { name: "Border",      color: "#2e2e2e", desc: "Lines, dividers, edges." },
];

const FEATURES: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }[] = [
  { icon: Palette,    title: "10 curated presets",       desc: "One tap to apply. Match a film's mood, a genre, or just your vibe." },
  { icon: RefreshCw,  title: "Custom color overrides",   desc: "Override any of the six color variables individually." },
  { icon: ImagePlus,  title: "Custom header image",      desc: "Upload a header. SafeSearch-vetted before it goes public." },
  { icon: Sparkles,   title: "Switch anytime",           desc: "Festival week, Halloween, Oscars Sunday — re-skin in seconds." },
  { icon: Eye,        title: "Visible to visitors",      desc: "Everyone who lands on your profile sees your theme, not just you." },
];

export default function CustomThemesFeaturePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link */}
      <Link
        href="/backstage-pass"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-amber-400 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Backstage Pass
      </Link>

      {/* Identity row — same shape as Movie Club / Screening Room. */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-amber-400/10 border border-amber-400/30">
            <Palette className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">Custom Themes</h1>
            <p className="text-xs text-[var(--foreground-muted)]">Skin your profile any way you want.</p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 bg-amber-400/15 border border-amber-400/40 rounded-full px-2.5 py-1">
          <Ticket className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pass</span>
        </span>
      </div>

      {/* ── Hero — a profile already wearing a theme ───────────────── */}
      <section className="mb-10">
        <AssetFrame asset={ASSETS.hero} kind="image" alt="A profile in a custom theme" />
      </section>

      {/* ── Live preset gallery ────────────────────────────────────
          The page's signature visual: every preset rendered in its
          own colors. No screenshots needed — the gallery IS the
          showcase. Each tile is real CSS, so the variety is
          immediately obvious without loading anything. */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2">Ten ready-made looks</p>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">Each one is a different vibe. Tap to apply, then keep going or roll your own colors on top.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {THEME_PRESETS.map((p) => (
            <PresetTile key={p.id} preset={p} />
          ))}
        </div>
      </section>

      {/* ── GIF — theme switching ──────────────────────────────────
          The "in motion" beat — shows the recolor immediacy that a
          static preset gallery can't convey. Emphasized container so
          it visually sits apart from the gallery and the swatches. */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2">Try them on</p>
        <p className="text-sm text-[var(--foreground-muted)] mb-3">Click a preset, the whole profile recolors instantly. Find a fit before you commit.</p>
        <div className="rounded-xl border border-amber-400/40 shadow-[0_0_30px_-12px_rgba(251,191,36,0.4)] overflow-hidden bg-[var(--surface)]">
          <div className="max-w-lg mx-auto p-3 sm:p-4">
            <AssetFrame asset={ASSETS.switching} kind="gif" alt="Switching themes on a profile" />
          </div>
        </div>
      </section>

      {/* ── Custom controls — 6 colored swatches ───────────────── */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2">Or roll your own</p>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">Override any of the six color variables individually. Mix preset bones with your own accent. Build something nobody else has.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SWATCHES.map((s) => (
            <div key={s.name} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-md shrink-0 border border-[var(--border)]"
                style={{ backgroundColor: s.color }}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{s.name}</p>
                <p className="text-[10px] text-[var(--foreground-muted)] leading-snug">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature list ──────────────────────────────────────────── */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-3">What you can do</p>
        <div className="space-y-2">
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
      <BackstagePassCTA featureName="Custom Themes" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// PresetTile — a live preview card rendered in its own preset colors.
// Mock content (preset name, a rating-style pill, a divider, a meta
// line) all use the preset's actual accent / text / muted / border /
// surface values, so each tile reads as "this is what the UI looks
// like in this theme" without loading a single screenshot.
// ──────────────────────────────────────────────────────────────────

function PresetTile({ preset }: { preset: ThemePreset }) {
  const c = preset.colors;
  return (
    <div
      className="rounded-lg overflow-hidden border"
      style={{
        backgroundColor: c.surfaceColor,
        borderColor: c.borderColor,
      }}
    >
      {/* Top accent strip — the preset's signature color band so it's
         visible at a glance. Matches the way the actual /profile
         header gets its identity from the accent. */}
      <div style={{ height: 3, backgroundColor: c.accentColor }} />

      <div className="p-3">
        <p className="text-sm font-bold mb-0.5 truncate" style={{ color: c.textColor }}>
          {preset.name}
        </p>
        <p className="text-[10px] mb-3 leading-snug line-clamp-2" style={{ color: c.mutedColor }}>
          {preset.description}
        </p>

        {/* Mock rating pill — uses accent color, outlined so it works
           regardless of accent vs surface contrast. Reads as
           "imagine the rest of the site looking like this". */}
        <div
          className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border"
          style={{
            borderColor: c.accentColor,
            color: c.accentColor,
          }}
        >
          <Star className="w-2.5 h-2.5 fill-current" />
          <span>8.4</span>
        </div>

        {/* Mock divider + meta line — exercises the border + muted
           variables so each tile demonstrates more than just accent. */}
        <div className="my-2 h-px" style={{ backgroundColor: c.borderColor }} />
        <p className="text-[9px]" style={{ color: c.mutedColor }}>2,341 reviews</p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// AssetFrame — same shape as the Screening Room helper. Renders the
// asset at its natural aspect ratio (no aspect-square box) and falls
// back to a sized placeholder when the file isn't dropped yet.
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
