import type { Metadata } from "next";
import path from "node:path";
import fs from "node:fs";
import Image from "next/image";
import Link from "next/link";
import { Ticket, Check, X, Star, BarChart3, MonitorPlay, Palette, Sparkles, Clapperboard, Layers } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { BACKSTAGE_FEATURES as FEATURES } from "@/lib/backstage-features";
import { detectNativeAppFromHeaders } from "@/lib/detect-native-app";
import SubscriptionPanel from "./SubscriptionPanel";

export const metadata: Metadata = {
  title: "Backstage Pass",
  description: "Premium membership for The Ratist — host screening rooms, customize your profile, get advanced analytics, build custom collections, and enjoy an ad-free experience.",
  alternates: { canonical: "/backstage-pass" },
};

// Stats are recomputed per-request so the hero counters reflect
// reality rather than a stale build snapshot.
export const dynamic = "force-dynamic";

type IconComp = React.ComponentType<{ className?: string }>;

interface ShowcaseCard {
  icon: IconComp;
  title: string;
  desc: string;
  href: string;
  /** Static image path under /public, 16:9. Falls back to gradient + icon if missing. */
  image: string;
  fallbackTint: string;
}

// The 6 features that get a visual showcase card. Two reuse images
// from /tools (Analytics, Collections) since the same illustrations
// fit both surfaces. The other four need bespoke art under
// /public/backstage-pass/.
const SHOWCASE: ShowcaseCard[] = [
  {
    icon: Star,
    title: "Live Review / Critics Mode",
    desc: "Live Review captures your reactions and ratings as you watch, scene by scene. Critics Mode unlocks reviewer-grade depth — long-form prose alongside every category — once you cross 250 reviews.",
    href: "/backstage-pass/critics-mode",
    image: "/backstage-pass/critics-mode.png",
    fallbackTint: "rgb(250 204 21 / 0.2)", // yellow-400
  },
  {
    icon: BarChart3,
    title: "My Analytics",
    desc: "Genre breakdowns, director and actor affinities, rating trends, your contrarian score, and custom reports across your entire viewing history.",
    href: "/backstage-pass/analytics",
    image: "/tools/analytics.png", // reuse from /tools
    fallbackTint: "rgb(244 63 94 / 0.2)", // rose-400
  },
  {
    icon: Layers,
    title: "Collections",
    desc: "Personalized recommendations built just for you, plus admin-curated collections and community-submitted lists — all scored against your taste. Build your own to share, too.",
    href: "/backstage-pass/collections",
    image: "/tools/collections.png", // reuse from /tools
    fallbackTint: "rgb(251 146 60 / 0.2)", // orange-400
  },
  {
    icon: MonitorPlay,
    title: "Host Screening Rooms",
    desc: "Run live, social watch-along sessions with your friends. Sync playback, chat in real time, run polls, and rate together when the credits roll.",
    href: "/backstage-pass/screening-room",
    image: "/tools/screening-room.png", // reuse from /tools — same illustration fits both surfaces
    fallbackTint: "rgb(168 85 247 / 0.2)", // purple-500
  },
  {
    icon: Palette,
    title: "Custom Themes",
    desc: "Personalize your profile with custom accent colors, surface tints, header images, and theme presets. Make it look like yours.",
    href: "/backstage-pass/custom-themes",
    image: "/backstage-pass/custom-themes.png",
    fallbackTint: "rgb(96 165 250 / 0.2)", // blue-400
  },
  {
    icon: Clapperboard,
    title: "Movie Club",
    desc: "A new film picked together each week. Vote on the contenders, watch with the community, then compare your takes and ratings.",
    href: "/backstage-pass/movie-club",
    image: "/backstage-pass/movie-club.png",
    fallbackTint: "rgb(204 0 51 / 0.2)", // ratist red
  },
];

function imageExists(publicPath: string): boolean {
  try {
    const abs = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

export default async function BackstagePassPage() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // Pre-resolve native-app detection on the server so SubscriptionPanel's
  // first render in the iOS WebView already hides the purchase CTAs.
  // Without this, Apple reviewers see the web pricing UI for ~50-200ms
  // before the client hook ticks — an active Guideline 3.1.3 risk.
  const initialIsNative = await detectNativeAppFromHeaders();

  // Live counters surfaced in the hero. Soft-failure: if any query
  // throws (e.g. transient DB blip), we just render zeros rather
  // than 500-ing the whole sales page.
  const stats = await Promise.all([
    prisma.user.count({
      where: {
        subscriptionTier: "backstage_pass",
        subscriptionStatus: { in: ["active", "trialing", "admin_granted"] },
        OR: [{ subscriptionExpiry: null }, { subscriptionExpiry: { gte: now } }],
      },
    }),
    prisma.customCollection.count(),
    prisma.screeningSession.count({ where: { createdAt: { gte: weekAgo } } }),
  ]).catch(() => [0, 0, 0]);
  const [subscriberCount, collectionsCount, screeningRoomsWeek] = stats;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero — ticket icon + value prop + live stat strip */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-amber-400/20 to-amber-400/5 border border-amber-400/30 mb-5 shadow-[0_0_40px_-10px_rgba(251,191,36,0.4)]">
          <Ticket className="w-10 h-10 text-amber-400" />
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-amber-400 mb-3 tracking-tight">Backstage Pass</h1>
        <p className="text-base sm:text-lg text-[var(--foreground-muted)] max-w-2xl mx-auto leading-relaxed">
          Built for cinephiles. Host watch parties. Customize your profile. Dig into your viewing data. Build curated collections. And never see another ad.
        </p>

        {/* Live stat strip — only render when any value is non-zero,
            so the page doesn't lead with an empty boast on day one. */}
        {(subscriberCount > 0 || collectionsCount > 0 || screeningRoomsWeek > 0) && (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
            {subscriberCount > 0 && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-amber-400">{subscriberCount.toLocaleString()}</span>
                <span className="text-[var(--foreground-muted)]">subscribers</span>
              </div>
            )}
            {collectionsCount > 0 && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-amber-400">{collectionsCount.toLocaleString()}</span>
                <span className="text-[var(--foreground-muted)]">collections built</span>
              </div>
            )}
            {screeningRoomsWeek > 0 && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-amber-400">{screeningRoomsWeek.toLocaleString()}</span>
                <span className="text-[var(--foreground-muted)]">screening rooms this week</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subscription state + plan picker + checkout (client) */}
      <SubscriptionPanel initialIsNative={initialIsNative} />

      {/* Premium feature showcase — visual cards, mirrors the /tools
          card pattern (16:9 image, icon chip, title, description). */}
      <section className="mb-12">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-widest text-[var(--ratist-red)] font-semibold mb-2">What you get</p>
          <h2 className="text-2xl font-bold text-white">Six premium surfaces, one pass.</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SHOWCASE.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-amber-400/60 transition-colors group flex flex-col"
              >
                <div className="relative aspect-video bg-[var(--surface-2)] overflow-hidden">
                  {imageExists(card.image) ? (
                    <Image
                      src={card.image}
                      alt={card.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{
                        background: `radial-gradient(ellipse at center, ${card.fallbackTint}, transparent 70%)`,
                      }}
                    >
                      <Icon className="w-12 h-12 text-white/70" />
                    </div>
                  )}
                  {/* Identity chip + Backstage Pass mark on every card */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1">
                    <Icon className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-amber-400/20 border border-amber-400/40 backdrop-blur-sm rounded-full px-2 py-0.5">
                    <Ticket className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pass</span>
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="text-base font-semibold text-white group-hover:text-amber-400 transition-colors mb-2">
                    {card.title}
                  </h3>
                  <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{card.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Compact full-feature comparison — full reference for anyone
          who wants the literal list. Sits below the showcase rather
          than leading the page. */}
      <section>
        <div className="text-center mb-4">
          <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] font-semibold mb-1">Full feature list</p>
          <h2 className="text-base font-semibold text-white">Free vs. Backstage Pass</h2>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_90px_90px] border-b border-[var(--border)] px-4 py-2.5">
            <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Feature</span>
            <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider text-center">Free</span>
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider text-center">Pass</span>
          </div>
          {FEATURES.map((f, i) => {
            const row = (
              <div key={i} className={`grid grid-cols-[1fr_90px_90px] px-4 py-2.5 items-center ${i % 2 === 0 ? "bg-[var(--surface-2)]/30" : ""} ${f.href ? "hover:bg-[var(--surface-2)] cursor-pointer" : ""}`}>
                <span className={`text-sm text-white ${f.href ? "hover:text-amber-400 transition-colors" : ""}`}>
                  {f.name} {f.href && <span className="text-[10px] text-[var(--foreground-muted)]">→</span>}
                </span>
                <div className="flex justify-center">
                  {typeof f.free === "string" ? (
                    <span className="text-[11px] font-semibold text-emerald-400 whitespace-nowrap">{f.free}</span>
                  ) : f.free ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <X className="w-4 h-4 text-[var(--foreground-muted)] opacity-30" />
                  )}
                </div>
                <div className="flex justify-center">
                  {typeof f.pass === "string" ? (
                    <span className="text-[11px] font-semibold text-amber-400 whitespace-nowrap">{f.pass}</span>
                  ) : f.pass ? (
                    <Check className="w-4 h-4 text-amber-400" />
                  ) : (
                    <X className="w-4 h-4 text-[var(--foreground-muted)] opacity-30" />
                  )}
                </div>
              </div>
            );
            return f.href ? <Link key={i} href={f.href}>{row}</Link> : row;
          })}
        </div>
      </section>
    </div>
  );
}
