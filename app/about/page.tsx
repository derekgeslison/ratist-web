import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Star, BarChart3, Users, Film, Brain, Tv, Sparkles, RefreshCw, Map,
  TrendingUp, Calendar, Eye, Award, MessageSquare, MonitorPlay, Newspaper, Ticket,
  Lightbulb, ListOrdered, Layers, ArrowRight, Flame, BookOpen,
  Compass, Bookmark, Crown, ChevronRight,
} from "lucide-react";
import TwoThumbsIcon from "@/components/TwoThumbsIcon";
import { AssetFrame } from "@/components/AssetFrame";
import { scoreColor } from "@/lib/ratings";
import { HeroPrimaryCTA, FinalPrimaryCTA } from "./_components/AuthAwareCTA";

export const metadata: Metadata = {
  title: "About",
  description:
    "The Ratist is a multi-dimensional movie & TV rating platform. It learns what you value in cinema, predicts how you'll rate films you haven't seen, and connects you with a community of cinephiles.",
  alternates: { canonical: "/about" },
};

const RED = "var(--ratist-red)";

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <Hero />
      <ProblemSection />
      <RatingSystemSection />
      <TasteProfileSection />
      <PredictiveSection />
      <ToolsSection />
      <CommunitySection />
      <BackstagePassSection />
      <FinalCTA />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Hero
// ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="text-center mb-20">
      <Image
        src="/logo-full.png"
        alt="The Ratist"
        width={220}
        height={110}
        className="h-16 w-auto mx-auto mb-6"
        priority
      />
      <h1 className="text-4xl sm:text-5xl font-black text-white mb-5 tracking-tight">
        Movie &amp; TV ratings,
        <br />
        <span style={{ color: RED }}>done right.</span>
      </h1>
      <p className="text-base sm:text-lg text-[var(--foreground-muted)] max-w-2xl mx-auto leading-relaxed mb-8">
        A single number can&apos;t tell you whether a film is for <em>you</em>. The Ratist breaks every movie and TV show down across what actually matters — then learns your taste and predicts how you&apos;ll feel about everything you haven&apos;t seen yet.
      </p>

      {/* Hero CTAs */}
      <div className="flex items-center justify-center gap-3 flex-wrap mb-12">
        <HeroPrimaryCTA />
        <Link
          href="/welcome"
          className="inline-flex items-center gap-2 text-sm font-semibold text-white border border-[var(--border)] hover:border-[var(--ratist-red)] px-5 py-2.5 rounded-full transition-colors"
        >
          <Sparkles className="w-4 h-4" /> Take the 2-minute tour
        </Link>
      </div>

      {/* Live demo card — the sales hook above the fold */}
      <RatingPreviewCard />
    </section>
  );
}

// Live CSS-rendered mockup of the central concept: every title shows two
// scores side-by-side — the community-weighted average AND your personal
// predicted score. This is the platform's signature, so it leads.
function RatingPreviewCard() {
  return (
    <div className="max-w-xl mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-[0_0_60px_-20px_rgba(204,0,51,0.4)]">
      <div className="flex items-start gap-4">
        <FakePoster />

        <div className="flex-1 min-w-0 text-left">
          <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] mb-1">A film you haven&apos;t seen</p>
          <p className="text-base font-bold text-white mb-3">The Predicted One <span className="text-[var(--foreground-muted)] font-normal">· 2024</span></p>

          <div className="flex items-center gap-5">
            {/* Community Rating */}
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)]">Community</span>
              </div>
              <p className="text-2xl font-black text-white leading-none">7.4</p>
            </div>

            <div className="h-10 w-px bg-[var(--border)]" />

            {/* Ratist Rating for You */}
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Image src="/logo.png" alt="Ratist" width={14} height={14} className="opacity-90" />
                <span className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)]">For you</span>
              </div>
              <p className="text-2xl font-black leading-none italic" style={{ color: scoreColor(8.6) }}>~8.6</p>
            </div>
          </div>

          <p className="text-[11px] text-[var(--foreground-muted)] mt-3 italic leading-snug">
            Predicted from your taste profile. The more you rate, the sharper this gets.
          </p>
        </div>
      </div>
    </div>
  );
}

// Tongue-in-cheek faux movie poster for the "Ratist Rating for You"
// explainer. Used to be a CSS composition with absolutely-positioned
// text + SVG, but the credit line ("A FILM BY T. RATIST") kept
// wrapping or clipping depending on font metrics + container width.
// Rendered to a static PNG by scripts/generate-fake-poster.ts so the
// layout is locked regardless of breakpoint. Regenerate the script
// if the design needs to change.
function FakePoster() {
  return (
    <div className="shrink-0 w-20 sm:w-24 aspect-[2/3] rounded-lg overflow-hidden relative border border-[var(--border)]">
      <Image
        src="/about/fake-poster.png"
        alt="A film by T. Ratist — The Predicted One (MMXXIV)"
        fill
        sizes="(max-width: 640px) 80px, 96px"
        className="object-cover"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Section header — adapted from the backstage-pass StageHeader pattern
// ──────────────────────────────────────────────────────────────────────

function SectionHeader({
  number, eyebrow, title, kicker,
}: {
  number?: string;
  eyebrow: string;
  title: string;
  kicker?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {number && (
          <span
            className="text-[10px] uppercase tracking-widest font-bold"
            style={{ color: RED }}
          >
            {number}
          </span>
        )}
        <span className="h-px w-6" style={{ background: "var(--ratist-red)", opacity: 0.4 }} />
        <span className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] font-semibold">
          {eyebrow}
        </span>
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{title}</h2>
      {kicker && (
        <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed max-w-2xl">{kicker}</p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 1. The Problem
// ──────────────────────────────────────────────────────────────────────

const PROBLEMS = [
  {
    name: "Rotten Tomatoes",
    desc: "A binary thumbs up/down from critics, aggregated into a percentage. A film at 100% could mean every critic thought it was just okay. The score tells you consensus, not quality — and critic priorities rarely match yours.",
  },
  {
    name: "IMDb",
    desc: "A single 1-10 score from anyone with an account. Heavily gamed by fan campaigns and review bombing. No insight into what makes a movie or show good or bad — just a number with no context.",
  },
  {
    name: "Traditional critic reviews",
    desc: "Often devolve into plot summaries with spoilers and attempts at wit. The purpose of a review is to help you decide if something is worth your time — most reviews fail at this.",
  },
  {
    name: "Streaming algorithms",
    desc: "Netflix assumes that because you watched something, you liked it — and that you want more of that genre. You might have loved The Irishman for its cinematography, not because it's a crime movie.",
  },
];

function ProblemSection() {
  return (
    <section className="mb-20">
      <SectionHeader
        eyebrow="The problem"
        title="One number can't capture what matters."
        kicker="Every existing rating system collapses cinema into a single signal that doesn't account for what you, specifically, care about."
      />
      <div className="grid sm:grid-cols-2 gap-4">
        {PROBLEMS.map((p) => (
          <div
            key={p.name}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--ratist-red)]/50 transition-colors"
          >
            <h3 className="text-sm font-bold text-white mb-2">{p.name}</h3>
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{p.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2. The Rating System
// ──────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { label: "Story & Narrative",   desc: "Plot, pacing, originality, character development." },
  { label: "Production & Style",  desc: "Cinematography, visuals, music, artistic effect." },
  { label: "Emotive Impact",      desc: "Emotional resonance, meaning, relatability." },
  { label: "Performance",         desc: "Acting quality, casting, dialogue." },
  { label: "Entertainment",       desc: "Appeal, rewatchability, overall enjoyment." },
  { label: "Your Overall",        desc: "Your gut feeling — the score that represents you." },
];

function RatingSystemSection() {
  return (
    <section className="mb-20">
      <SectionHeader
        number="01"
        eyebrow="The rating system"
        title="Five categories. The score has to mean something."
        kicker="When you rate a film on The Ratist, you don't just give it a star. You score it across the dimensions that actually make a movie work — each with optional sub-fields to go deeper."
      />

      <div className="bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 mb-6">
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {CATEGORIES.map((c, i) => (
            <div
              key={c.label}
              className="bg-black/30 border border-[var(--border)] rounded-lg p-4 relative overflow-hidden"
            >
              <span
                className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-widest opacity-50"
                style={{ color: RED }}
              >
                0{i + 1}
              </span>
              <p className="text-sm font-bold text-white mb-1">{c.label}</p>
              <p className="text-xs text-[var(--foreground-muted)] leading-snug">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 mb-6">
        <h3 className="text-base font-bold text-white mb-3">How a Ratist rating becomes <em>your</em> rating</h3>
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-3">
          You can submit a quick 1-10 score for any movie or show. But the real signal comes when you fill out the full rubric — categories and the sub-fields beneath them. Did the plot work? How was the choreography of the action sequences? The cinematography? The score? The deeper your rating, the more The Ratist has to learn from.
        </p>
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
          Every rating you submit feeds your <span className="text-white font-medium">taste profile</span> — a multi-dimensional snapshot of what you value in cinema. Some people care most about narrative. Some about visual style. Your profile reflects <em>you</em>, not a critic, not the average viewer.
        </p>
      </div>

      <div className="mb-2">
        <AssetFrame
          asset={{ src: "/about/rating-form.png", w: 1400, h: 980 }}
          alt="A full Ratist rating form on a movie page"
        />
        <p className="text-[11px] text-[var(--foreground-muted)] text-center mt-2 italic">
          A real Ratist rating — five categories, optional sub-fields, your overall feeling.
        </p>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3. Your Taste Profile
// ──────────────────────────────────────────────────────────────────────

// Mirrors the labels rendered by ProfileTabs.tsx's Movie Component
// Preferences section. Scores are on the 0-10 scale that scoreColor
// expects, so the bar colors here match what shows up on a real
// profile (green ≥8, yellow ≥6, orange ≥4, red <4).
const SAMPLE_PROFILE: { label: string; score: number }[] = [
  { label: "Narrative-focused",     score: 9.1 },
  { label: "Character-focused",     score: 8.4 },
  { label: "Performance-focused",   score: 7.2 },
  { label: "Message-focused",       score: 6.5 },
  { label: "Cinematic-focused",     score: 4.8 },
  { label: "Entertainment-focused", score: 3.6 },
];

function TasteProfileSection() {
  return (
    <section className="mb-20">
      <SectionHeader
        number="02"
        eyebrow="Your taste profile"
        title="A profile that reflects what you actually value."
        kicker="The Ratist builds a personal model of your cinematic taste from every rating you submit. The more you rate, the sharper the picture."
      />

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: live CSS demo — mirrors the Movie Component Preferences
           section that lives on every profile page. */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <h3 className="text-base font-semibold text-white mb-4">Movie Component Preferences</h3>
          <div className="space-y-2">
            {SAMPLE_PROFILE.map((row) => {
              const pct = (row.score / 10) * 100;
              const color = scoreColor(row.score);
              return (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-sm text-[var(--foreground-muted)] w-40 shrink-0 text-left">{row.label}</span>
                  <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="text-sm font-semibold w-8 text-right tabular-nums" style={{ color }}>
                    {row.score.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--foreground-muted)] mt-5 italic leading-snug">
            This viewer cares most about narrative and character; less about visual style or pure entertainment. Their recommendations lean into character-driven cinema.
          </p>
        </div>

        {/* Right: what we track / what you get */}
        <div className="grid grid-cols-1 gap-4">
          <ProfileBox
            icon={Compass}
            title="What we track"
            items={[
              "Per-category and sub-field scores across every rating",
              "Genre preferences weighted by your actual ratings, not just watch history",
              "Era, runtime, and language tendencies",
              "Which films and people resonate with you",
            ]}
          />
          <ProfileBox
            icon={Sparkles}
            title="What you get out of it"
            items={[
              "Predicted score for any film or show before you watch it",
              "Recommendations grounded in your taste, not what's trending",
              "Side-by-side taste matching with friends and other users",
              "A clearer mental model of your own cinematic preferences",
            ]}
          />
        </div>
      </div>

      <div className="mt-6">
        <AssetFrame
          asset={{ src: "/about/taste-profile.png", w: 1440, h: 900 }}
          alt="A Ratist profile page showing the taste profile and persona"
        />
        <p className="text-[11px] text-[var(--foreground-muted)] text-center mt-2 italic">
          Your profile page surfaces your persona, component bars, top genres, and more.
        </p>
      </div>
    </section>
  );
}

function ProfileBox({
  icon: Icon, title, items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: string[];
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="inline-flex items-center justify-center w-7 h-7 rounded-md"
          style={{ background: "rgba(204,0,51,0.15)", border: "1px solid rgba(204,0,51,0.4)" }}
        >
          <Icon className="w-4 h-4 text-[var(--ratist-red)]" />
        </div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2 text-xs text-[var(--foreground-muted)] leading-relaxed">
            <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" style={{ color: RED }} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 4. Predictive ratings + /recommend
// ──────────────────────────────────────────────────────────────────────

function PredictiveSection() {
  return (
    <section className="mb-20">
      <SectionHeader
        number="03"
        eyebrow="Predictive ratings"
        title="Know how you'll feel before you press play."
        kicker="Every movie and show on The Ratist carries two numbers: the community average and your personal predicted score. The second one updates as you rate."
      />

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Prediction confidence demo */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] font-semibold mb-4">
            Prediction breakdown
          </p>
          <div className="flex items-baseline gap-3 mb-4">
            <p className="text-5xl font-black leading-none" style={{ color: RED }}>8.6</p>
            <p className="text-xs text-[var(--foreground-muted)]">predicted for you</p>
          </div>
          <div className="space-y-2.5 text-xs text-[var(--foreground-muted)]">
            <PredictionRow label="Story (your top priority)" pct={92} match="strong" />
            <PredictionRow label="Performance" pct={84} match="strong" />
            <PredictionRow label="Emotive impact" pct={71} match="medium" />
            <PredictionRow label="Style" pct={58} match="lukewarm" />
          </div>
          <p className="text-[11px] text-[var(--foreground-muted)] mt-4 italic leading-snug">
            Community: 7.4. You: predicted 8.6. The Ratist thinks this one&apos;s sharper for your tastes than the average viewer&apos;s.
          </p>
        </div>

        {/* /recommend tool callout */}
        <div className="bg-gradient-to-br from-[var(--surface)] to-black/40 border border-[var(--border)] rounded-2xl p-6 relative overflow-hidden">
          <div
            className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20"
            style={{ background: RED }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-5 h-5" style={{ color: RED }} />
              <h3 className="text-base font-bold text-white">What Should I Watch?</h3>
            </div>
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-4">
              The AI recommender that actually knows what you like. Ask in plain English — &ldquo;something slow and emotional&rdquo;, &ldquo;a 90s thriller I haven&apos;t seen&rdquo;, &ldquo;a date-night comedy that won&apos;t insult me&rdquo;. The Ratist returns titles ranked by what <em>you&apos;ll</em> score them, not the global average.
            </p>
            <Link
              href="/tools/recommend"
              className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
              style={{ color: RED }}
            >
              Try the recommender <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      <AssetFrame
        asset={{ src: "/about/recommend.png", w: 1440, h: 900 }}
        alt="A /tools/recommend results page"
      />
      <p className="text-[11px] text-[var(--foreground-muted)] text-center mt-2 italic">
        Real results from the recommender — every title scored against your profile.
      </p>
    </section>
  );
}

function PredictionRow({ label, pct, match }: { label: string; pct: number; match: "strong" | "medium" | "lukewarm" }) {
  const matchColor =
    match === "strong" ? "text-emerald-400" : match === "medium" ? "text-amber-400" : "text-[var(--foreground-muted)]";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white">{label}</span>
        <span className={`text-[10px] uppercase tracking-wide font-semibold ${matchColor}`}>{match}</span>
      </div>
      <div className="h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: RED, opacity: 0.5 + (pct / 100) * 0.5 }} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 5. Cinephile Tools
// ──────────────────────────────────────────────────────────────────────

const TOOLS = [
  { icon: BarChart3,    title: "Deep ratings",         desc: "Rate movies and TV shows across 20+ criteria. Quick mode for a fast score, Fanatics mode for detailed commentary.", href: null },
  { icon: Star,         title: "Score estimates",      desc: "See a predicted score for any movie or show before you watch it, based on your taste profile.", href: null },
  { icon: Sparkles,     title: "AI recommendations",   desc: "Three AI tools — natural-language recommendations, custom collections, and AI movie search.", href: "/tools/recommend" },
  { icon: BookOpen,     title: "Watch Companion",     desc: "Live, scene-aware annotations as you watch — explanations, trivia, and answers to common confusions.", href: null },
  { icon: Eye,          title: "Film Diary",           desc: "Track every movie and episode you watch with calendar views, monthly lists, and shareable year-in-review stats.", href: "/seen" },
  { icon: Bookmark,     title: "Watchlists",           desc: "Multiple lists, collaborative sharing, streaming-aware sorting. Mark things seen to clear the deck.", href: "/watchlist" },
  { icon: Layers,       title: "Collections",          desc: "Curated lists from The Ratist and the community. Match scores show which collections fit your taste.", href: "/collections" },
  { icon: ListOrdered,  title: "Personal Rankings",    desc: "Build head-to-head ranked lists by genre, decade, director — any cut of your seen films.", href: "/tools/rankings" },
  { icon: Tv,           title: "TV show tracking",     desc: "Mark individual episodes seen, track seasons, and rate shows at series or per-season level.", href: "/movies?type=tv" },
  { icon: TrendingUp,   title: "Box Office Insights", desc: "All-time leaderboards, year-by-year top earners, franchise totals, studio rankings, ROI champions.", href: "/box-office" },
  { icon: Calendar,     title: "Release Calendar",     desc: "Upcoming theatrical, digital, and streaming releases. Filterable by region, genre, MPA rating, and time horizon.", href: "/releases" },
  { icon: Newspaper,    title: "News & trailers",      desc: "Editorial articles, freshly-detected trailers, and headlines from Deadline, Variety, THR, and more.", href: "/news" },
  { icon: Users,        title: "Taste matching",       desc: "See how your taste compares to friends and other users. Follow people, build feeds, and find your taste twin.", href: "/connections" },
  { icon: Award,        title: "Badge system",         desc: "40+ badges across 12 categories. Auto-awarded as you rate, watch, and engage. Some rare, some absurd.", href: "/badges" },
  { icon: Crown,        title: "Year in Review",       desc: "A Spotify-Wrapped-style annual recap. Five chapters, share cards, your cinephile archetype, your taste twin.", href: null },
  { icon: RefreshCw,    title: "Smart import",         desc: "Bring your Letterboxd or IMDb history in seconds. Your ratings contribute to your profile immediately.", href: "/profile/import" },
];

function ToolsSection() {
  return (
    <section className="mb-20">
      <SectionHeader
        number="04"
        eyebrow="Cinephile tools"
        title="Built for the people who watch on purpose."
        kicker="Everything around the rating system is designed to deepen the way you engage with film — from tracking what you've seen to planning what's next."
      />
      <div className="grid sm:grid-cols-2 gap-3">
        {TOOLS.map(({ icon: Icon, title, desc, href }) => {
          const inner = (
            <>
              <div
                className="inline-flex items-center justify-center w-9 h-9 rounded-md shrink-0"
                style={{ background: "rgba(204,0,51,0.12)", border: "1px solid rgba(204,0,51,0.3)" }}
              >
                <Icon className="w-4 h-4" style={{ color: RED }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{title}</p>
                <p className="text-xs text-[var(--foreground-muted)] leading-snug mt-0.5">{desc}</p>
              </div>
            </>
          );
          const cls =
            "flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--ratist-red)]/50 transition-colors";
          return href ? (
            <Link key={title} href={href} className={cls}>{inner}</Link>
          ) : (
            <div key={title} className={cls}>{inner}</div>
          );
        })}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 6. Community
// ──────────────────────────────────────────────────────────────────────

const COMMUNITY = [
  { icon: MessageSquare, title: "Forum",          desc: "Long-form discussion, theory threads, polls, recommendation requests, and structured debates.", href: "/forum" },
  { icon: TwoThumbsIcon, title: "Two Thumbs",     desc: "Per-movie for/against debates. Read both sides, submit your own arguments, vote on the verdict.", href: "/posts?type=PUNCH_AND_JUDY" },
  { icon: Map,           title: "Movie Maps",     desc: "Visual guides for branching narratives, plus curated viewing lists and themed deep-dives.", href: "/posts?type=MOVIE_MAP" },
  { icon: MonitorPlay,   title: "Screening Room", desc: "Watch movies together. Sync up, chat live, run polls, rate together when the credits roll.", href: "/screening-room" },
  { icon: Ticket,        title: "Movie Club",     desc: "A weekly curated pick the whole community watches and rates together. Backstage Pass perk.", href: "/backstage-pass/movie-club" },
  { icon: Brain,         title: "Cine-Q Trivia",  desc: "Daily movie trivia with weighted difficulty scoring. Climb the leaderboard, prove what you know.", href: "/community/cineq" },
  { icon: RefreshCw,     title: "Recasts",        desc: "Suggest who should have played that role. The community votes on the best alternate casting.", href: "/community/recast" },
  { icon: Sparkles,      title: "Looks Like",     desc: "Celebrity lookalike pairs — vote on who really could be twins.", href: "/community/looks-like" },
  { icon: Flame,         title: "Hot Takes",      desc: "Your spiciest movie opinion, 280 characters. The community decides: hot or not.", href: "/community/hot-takes" },
  { icon: Lightbulb,     title: "Pitches",        desc: "Pitch the movie or show that should exist. The community votes on which ones we'd actually watch.", href: "/community/pitches" },
];

function CommunitySection() {
  return (
    <section className="mb-20">
      <SectionHeader
        number="05"
        eyebrow="The community"
        title="A platform for people who care about film."
        kicker="The Ratist isn't a content firehose. It's a place to find other cinephiles, follow their taste, and argue about everything from cinematography to the third act of The Godfather Part III."
      />

      <div className="grid sm:grid-cols-2 gap-3">
        {COMMUNITY.map(({ icon: Icon, title, desc, href }) => (
          <Link
            key={title}
            href={href}
            className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--ratist-red)]/50 transition-colors"
          >
            <div
              className="inline-flex items-center justify-center w-9 h-9 rounded-md shrink-0"
              style={{ background: "rgba(204,0,51,0.12)", border: "1px solid rgba(204,0,51,0.3)" }}
            >
              <Icon className="w-4 h-4 text-[var(--ratist-red)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">{title}</p>
              <p className="text-xs text-[var(--foreground-muted)] leading-snug mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex items-start gap-4">
        <div
          className="inline-flex items-center justify-center w-10 h-10 rounded-md shrink-0"
          style={{ background: "rgba(204,0,51,0.12)", border: "1px solid rgba(204,0,51,0.3)" }}
        >
          <Users className="w-5 h-5" style={{ color: RED }} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white mb-1">Follow people whose taste matches yours.</h3>
          <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            Because every user has a taste profile, you can see at a glance how compatible you are with anyone on the site. Follow your highest-match users and the community surfaces above reshape around their picks too.
          </p>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 7. Backstage Pass — the one amber section
// ──────────────────────────────────────────────────────────────────────

function BackstagePassSection() {
  return (
    <section className="mb-20">
      <div className="bg-gradient-to-br from-amber-400/10 via-[var(--surface)] to-[var(--surface-2)] border border-amber-400/40 rounded-2xl p-6 sm:p-8 shadow-[0_0_40px_-20px_rgba(251,191,36,0.4)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-amber-400/15 border border-amber-400/40">
            <Ticket className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Optional upgrade</p>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Backstage Pass</h2>
          </div>
        </div>
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-5">
          The Ratist is free. Backstage Pass is for the people who want more — an ad-free experience plus power-user surfaces: deep personal analytics, custom collections, Critics Mode for reviewer-grade rating breakdowns, custom themes, host privileges in the Screening Room, and the curated weekly Movie Club.
        </p>
        <Link
          href="/backstage-pass"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
        >
          Learn more about Backstage Pass <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 8. Final CTA
// ──────────────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section className="text-center py-12 border-t border-[var(--border)]">
      <h2 className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight">
        Ready to rate the right way?
      </h2>
      <p className="text-sm text-[var(--foreground-muted)] mb-7 max-w-md mx-auto">
        Free to use. Better data. Sharper recommendations. A community that actually argues about cinema.
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <FinalPrimaryCTA />
        <Link
          href="/welcome"
          className="border border-[var(--border)] text-white hover:border-[var(--ratist-red)] font-semibold px-7 py-3 rounded-full transition-colors text-sm"
        >
          Take the tour
        </Link>
        <Link
          href="/movies"
          className="text-[var(--foreground-muted)] hover:text-white font-medium px-4 py-3 transition-colors text-sm"
        >
          Browse movies &amp; shows →
        </Link>
      </div>
    </section>
  );
}

