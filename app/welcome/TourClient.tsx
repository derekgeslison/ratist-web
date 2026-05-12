"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ChevronLeft, ChevronRight, Check, Star, Sparkles,
  MonitorPlay, BookOpen, Users, Lock, Flame, RefreshCw, Lightbulb,
  MessageSquare, Film, BarChart2, ThumbsUp, ThumbsDown, Link2,
  Bookmark, Wand2, Layers, ArrowUp, ArrowDown,
  type LucideIcon,
} from "lucide-react";
import RatingBadge from "@/components/RatingBadge";
import { track } from "@/lib/analytics";
import { useAuth } from "@/context/AuthContext";
import type { TourImages } from "./page";

const DISMISS_KEY = "ratist:tour-banner-dismissed";

// First 6 are the core tour. Steps 7-10 unlock when the user picks
// "Show me 4 more" at the end of step 6 (the fork).
const STEP_TITLES = [
  "Rate with depth",
  "Watch Companion",
  "Screening Room",
  "Film Diary",
  "What Else Do I Know Them From?",
  "Community",
  "Watchlists",
  "What Should I Watch?",
  "Collections",
  "Shared Cast & Crew",
];
const CORE_STEPS = 6;
const TOTAL_STEPS = STEP_TITLES.length;

interface Props { images: TourImages }

export default function TourClient({ images }: Props) {
  const { user, markTourDismissed } = useAuth();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [extended, setExtended] = useState(false);

  // Mark the tour dismissed both locally (for anonymous users) and on
  // the server (for signed-in users). Fire-and-forget; if either path
  // fails the other still works.
  useEffect(() => {
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    if (!user) return;
    markTourDismissed();
    (async () => {
      try {
        const token = await user.getIdToken();
        await fetch("/api/me/tour-dismiss", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* ignore */ }
    })();
  }, [user, markTourDismissed]);

  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step, done]);

  // GA4 step-view event. Fires on every step the user lands on (incl.
  // back-nav). `extended` is read at fire time so the metric reflects
  // whether the user has chosen the longer tour.
  useEffect(() => {
    if (done) return;
    track("tour_step_viewed", { step: step + 1, extended });
  }, [step, done, extended]);

  const total = extended ? TOTAL_STEPS : CORE_STEPS;
  const isForkStep = step === CORE_STEPS - 1;  // step 6 (index 5) shows the fork
  const isLastStep = step === total - 1;

  function next() {
    if (step >= total - 1) {
      track("tour_finished", { at_step: step + 1, extended });
      setDone(true);
    } else {
      setStep((s) => s + 1);
    }
  }
  function back() { setStep((s) => Math.max(0, s - 1)); }
  function finishHere() {
    track("tour_finished", { at_step: step + 1, extended });
    setDone(true);
  }
  function continueExtended() {
    track("tour_extended_chosen", { from_step: step + 1 });
    if (!extended) setExtended(true);
    setStep(CORE_STEPS);  // jump to step 7
  }
  function trackSkip() {
    track("tour_skipped", { at_step: step + 1, extended });
  }

  if (done) return <CompletionScreen extended={extended} />;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)]">
          Step {step + 1} of {total} — <span className="text-white">{STEP_TITLES[step]}</span>
        </p>
        <Link href="/" onClick={trackSkip} className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">Skip tour</Link>
      </div>
      <div className="flex gap-1.5 mb-7">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            aria-label={`Go to step ${i + 1}`}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-[var(--ratist-red)]" : "bg-[var(--surface-2)] hover:bg-[var(--border)]"}`}
          />
        ))}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8">
        {step === 0 && <RateStep images={images} />}
        {step === 1 && <CompanionStep images={images} />}
        {step === 2 && <ScreeningStep images={images} />}
        {step === 3 && <DiaryStep images={images} />}
        {step === 4 && <ActorLookupStep images={images} />}
        {step === 5 && <CommunityStep images={images} />}
        {step === 6 && <WatchlistStep images={images} />}
        {step === 7 && <RecommendStep images={images} />}
        {step === 8 && <CollectionsStep images={images} />}
        {step === 9 && <SharedCastStep images={images} />}

        {isForkStep && (
          <div className="mt-6 pt-5 border-t border-[var(--border)]">
            <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] text-center mb-3">That&rsquo;s the core 6. Want to keep going?</p>
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
              <button
                onClick={finishHere}
                className="px-5 py-2.5 text-sm font-semibold bg-[var(--surface-2)] hover:bg-[var(--border)] border border-[var(--border)] text-white rounded-lg transition-colors"
              >
                {extended ? "Finish tour now" : "Finish tour"}
              </button>
              <button
                onClick={continueExtended}
                className="flex items-center justify-center gap-1 px-5 py-2.5 text-sm font-semibold bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-lg transition-colors"
              >
                {extended ? "Continue tour" : "Show me 4 more"} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mt-6">
        <button
          onClick={back}
          disabled={step === 0}
          className="flex items-center gap-1 px-3 py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        {!isForkStep && (
          <button
            onClick={next}
            className="flex items-center gap-1 px-5 py-2.5 text-sm font-semibold bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-lg transition-colors"
          >
            {isLastStep ? "Finish" : "Next"} <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ============= LAYOUT PRIMITIVES =============

function StepHeader({ icon: Icon, title, lead }: { icon: LucideIcon; title: string; lead: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5 mb-2">
        <Icon className="w-5 h-5 text-[var(--ratist-red)]" />
        <h2 className="text-xl sm:text-2xl font-bold text-white">{title}</h2>
      </div>
      <p className="text-sm text-[var(--foreground-muted)]">{lead}</p>
    </div>
  );
}

function WhyBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-white/90 leading-relaxed mb-6 space-y-2.5">
      {children}
    </div>
  );
}

function WhereBlock({ where, why }: { where: React.ReactNode; why: React.ReactNode }) {
  return (
    <div className="mt-6 grid sm:grid-cols-2 gap-3">
      <div className="bg-[var(--surface-2)] border-l-2 border-[var(--ratist-red)] rounded-r-lg p-4">
        <p className="text-[10px] uppercase tracking-widest text-[var(--ratist-red)] font-semibold mb-1.5">Where to find it</p>
        <p className="text-sm text-white">{where}</p>
      </div>
      <div className="bg-[var(--surface-2)] border-l-2 border-[var(--ratist-red)]/50 rounded-r-lg p-4">
        <p className="text-[10px] uppercase tracking-widest text-[var(--ratist-red)]/80 font-semibold mb-1.5">Why use it</p>
        <p className="text-sm text-white">{why}</p>
      </div>
    </div>
  );
}

function Disclaimer({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 text-[10px] text-[var(--foreground-muted)] italic text-center">
      {children}
    </p>
  );
}

function InTheWild({ slot }: { slot: { src: string; w: number; h: number } | null | undefined }) {
  return (
    <div className="mt-6">
      <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] mb-2 text-center font-semibold">In the wild</p>
      {slot ? (
        <div className="rounded-lg overflow-hidden border border-[var(--border)]">
          <Image src={slot.src} alt="" width={slot.w} height={slot.h} className="w-full h-auto" />
        </div>
      ) : (
        <div className="bg-[var(--surface-2)] border border-dashed border-[var(--border)] rounded-lg py-8 px-4 text-center">
          <p className="text-xs text-[var(--foreground-muted)] italic">A screenshot of this feature in the real product will appear here.</p>
        </div>
      )}
    </div>
  );
}

// Tiny helpers for TMDB image URLs.
function tmdbPoster(path: string | null | undefined, size = "w200"): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
function tmdbProfile(path: string | null | undefined, size = "w185"): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function PosterThumb({ src, alt, size = "md" }: { src: string | null; alt: string; size?: "xs" | "sm" | "md" }) {
  const dims = size === "xs"
    ? { box: "w-8 h-12", w: 64, h: 96 }
    : size === "sm"
      ? { box: "w-10 h-14", w: 80, h: 120 }
      : { box: "w-14 h-20", w: 112, h: 168 };
  return (
    <div className={`${dims.box} rounded-md bg-[var(--surface)] border border-[var(--border)] overflow-hidden shrink-0 relative`}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={`${dims.w}px`} className="object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)]">
          <Film className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}

function ProfileAvatar({ src, alt, size = "md" }: { src: string | null; alt: string; size?: "sm" | "md" }) {
  const dims = size === "sm"
    ? { box: "w-7 h-7", w: 56 }
    : { box: "w-10 h-10", w: 80 };
  return (
    <div className={`${dims.box} rounded-full overflow-hidden bg-[var(--ratist-red)]/20 border border-[var(--ratist-red)]/30 shrink-0 relative`}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={`${dims.w}px`} className="object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white">
          {alt.split(" ").map((p) => p[0]).join("").slice(0, 2)}
        </div>
      )}
    </div>
  );
}

// ============= STEP 1: RATE =============
function RateStep({ images }: Props) {
  const [vals, setVals] = useState<[number, number, number, number, number]>([8, 8, 8, 8, 8]);
  const labels = ["Story", "Production & Style", "Emotive Effect", "Acting & Casting", "Pure Entertainment"];
  const mean = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  const poster = tmdbPoster(images.movies.toyStory);

  function setAt(i: number, v: number) {
    setVals((cur) => { const next = [...cur] as typeof cur; next[i] = v; return next; });
  }

  return (
    <div>
      <StepHeader icon={Star} title="Rate with depth" lead="Cinema isn't one thing. So your rating spans five dimensions, not one number." />

      <WhyBlock>
        <p>
          Most rating systems give you a single number. Two viewers can both rate the same film 8/10 and mean wildly
          different things — one was floored by the script, the other by the score and nothing else.
        </p>
        <p>
          Our rubric splits each rating into five categories — Story, Production &amp; Style, Emotive Effect,
          Acting &amp; Casting, Pure Entertainment. The deeper you go in each one, the more we learn about how you
          actually feel about cinema, and the better we can match you with people who feel it the same way.
        </p>
      </WhyBlock>

      <div className="bg-[var(--surface-2)] rounded-xl p-4 sm:p-5 mb-4">
        <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">What you&rsquo;ll see on every movie page</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3.5">
            <RatingBadge type="community" score={7.8} size="lg" />
            <p className="text-[11px] text-[var(--foreground-muted)] mt-1.5 leading-snug">
              <span className="text-white font-semibold">Community Rating</span> — what everyone here averages to.
            </p>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3.5">
            <RatingBadge type="ratist" score={8.2} isEstimate size="lg" />
            <p className="text-[11px] text-[var(--foreground-muted)] mt-1.5 leading-snug">
              <span className="text-white font-semibold">Ratist estimate</span> — based on your taste preferences from films you&rsquo;ve rated. The <span className="font-mono">~</span> means estimate; rate this one and it becomes your actual score.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[var(--surface-2)] rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-4">
          <PosterThumb src={poster} alt="Toy Story" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] mb-0.5">Try it on</p>
            <p className="text-base font-semibold text-white">Toy Story <span className="text-[var(--foreground-muted)] font-normal">(1995)</span></p>
            <p className="text-xs text-[var(--foreground-muted)]">G &middot; Animation, Family &middot; 81 min</p>
          </div>
        </div>

        <div className="space-y-3.5">
          {labels.map((label, i) => (
            <div key={label}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-white">{label}</span>
                <span className="font-mono text-[var(--ratist-red)]">{vals[i]}/10</span>
              </div>
              <input
                type="range" min={1} max={10} step={1} value={vals[i]}
                onChange={(e) => setAt(i, +e.target.value)}
                className="w-full accent-[var(--ratist-red)]"
              />
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-[var(--border)] text-center">
          <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide mb-1">Your rating</p>
          <p className="text-3xl font-bold text-white">{mean}<span className="text-base text-[var(--foreground-muted)] font-normal">/10</span></p>
        </div>
      </div>

      <WhereBlock
        where={<>On any movie or show page, click <span className="font-semibold">&ldquo;Rate this&rdquo;</span> below the title. Pick the depth you want — quick 1&ndash;10 or the full rubric above.</>}
        why={<>The more you rate (and the deeper you go in each category), the more accurate your <span className="font-semibold">Ratist estimate</span> becomes on films you haven&rsquo;t seen — and the closer your taste-twin matches get.</>}
      />

      <Disclaimer>Tour preview — moving these sliders won&rsquo;t save a rating to your account.</Disclaimer>

      <InTheWild slot={images.screenshots.rate} />
    </div>
  );
}

// ============= STEP 2: WATCH COMPANION =============
// Mix of plot-fact reveals and relationship triples — the real Watch
// Companion tracks both. The relationship row uses different styling
// so users get a feel for how the tool surfaces "X is parent of Y" or
// "A works for B" alongside narrative beats.
type CompanionEntry =
  | { unlockAt: number; kind: "fact"; text: string }
  | { unlockAt: number; kind: "relationship"; rel: string; target: string };

const COBB_BIO: CompanionEntry[] = [
  { unlockAt: 0,  kind: "fact", text: "Dom Cobb. A professional thief who steals corporate secrets through dream-sharing technology." },
  { unlockAt: 12, kind: "relationship", rel: "parent of", target: "Phillipa Cobb" },
  { unlockAt: 38, kind: "fact", text: "Saito offers him a way home — but the price is an impossible job: implanting an idea, not stealing one." },
  { unlockAt: 60, kind: "fact", text: "His wife Mal keeps appearing in his dreams. She is dangerous to the team, and Cobb hasn't told them why." },
  { unlockAt: 82, kind: "fact", text: "The deeper the team goes, the harder it is to tell whose dream they're really in — including Cobb's." },
];

function pctToTime(pct: number, totalMin: number): string {
  const total = Math.round((pct / 100) * totalMin);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function CompanionStep({ images }: Props) {
  const RUNTIME_MIN = 148;
  const [pct, setPct] = useState(15);
  const visibleCount = COBB_BIO.filter((b) => pct >= b.unlockAt).length;
  const moviePoster = tmdbPoster(images.movies.inception);
  const leoPhoto = tmdbProfile(images.people.leo);

  return (
    <div>
      <StepHeader icon={BookOpen} title="Watch Companion" lead="The spoiler-safe reference, built scene by scene." />

      <WhyBlock>
        <p>
          You&rsquo;re an hour into a film and you&rsquo;ve lost track of who someone is, or which side they&rsquo;re on.
          Pausing to Google means landing on a Wikipedia page that spoils the ending in the second paragraph.
        </p>
        <p>
          The Watch Companion is a spoiler-safe reference for every movie and show. Tell it where you are in the
          runtime, and it shows you only what you&rsquo;ve already seen — characters, factions, places, and timeline
          beats. Move the slider to feel how it gates new information.
        </p>
      </WhyBlock>

      <div className="bg-[var(--surface-2)] rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-4">
          <PosterThumb src={moviePoster} alt="Inception" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] mb-0.5">Now watching</p>
            <p className="text-base font-semibold text-white">Inception <span className="text-[var(--foreground-muted)] font-normal">(2010)</span></p>
            <p className="text-xs text-[var(--foreground-muted)]">PG-13 &middot; Sci-Fi, Heist &middot; 148 min</p>
          </div>
          <p className="text-sm font-mono text-[var(--ratist-red)] shrink-0">{pctToTime(pct, RUNTIME_MIN)}</p>
        </div>

        <div className="mb-1.5 flex justify-between text-[10px] text-[var(--foreground-muted)]">
          <span>Drag to your runtime</span>
          <span>{Math.round(pct)}%</span>
        </div>
        <input
          type="range" min={0} max={100} step={1} value={pct}
          onChange={(e) => setPct(+e.target.value)}
          className="w-full accent-[var(--ratist-red)] mb-5"
        />

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div className="flex items-start gap-3 mb-3">
            <ProfileAvatar src={leoPhoto} alt="Leonardo DiCaprio" />
            <div>
              <p className="text-sm font-semibold text-white">Dom Cobb</p>
              <p className="text-[10px] text-[var(--foreground-muted)]">played by Leonardo DiCaprio</p>
            </div>
            <p className="ml-auto text-[10px] text-[var(--foreground-muted)] font-mono shrink-0">{visibleCount}/{COBB_BIO.length} revealed</p>
          </div>
          <ul className="space-y-2.5">
            {COBB_BIO.map((b, i) => {
              const unlocked = pct >= b.unlockAt;
              const mutedClass = unlocked ? "text-white" : "text-[var(--foreground-muted)]/50";
              const blurClass = unlocked ? "" : "blur-[3px] select-none";
              return (
                <li key={i} className={`flex gap-2.5 text-xs leading-relaxed transition-opacity ${mutedClass}`}>
                  <span className="shrink-0 mt-0.5">
                    {!unlocked ? <Lock className="w-3 h-3" />
                      : b.kind === "relationship" ? <Link2 className="w-3 h-3 text-blue-400" />
                      : <span className="text-[var(--ratist-red)]">✦</span>}
                  </span>
                  {b.kind === "fact" ? (
                    <span className={blurClass}>{b.text}</span>
                  ) : (
                    <span className={`${blurClass} flex items-center gap-1.5 flex-wrap`}>
                      <span className="text-[10px] uppercase tracking-widest text-blue-400/80 font-semibold">{b.rel}</span>
                      <span className="text-[var(--foreground-muted)]">&middot;</span>
                      <span className="text-white font-medium">{b.target}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <WhereBlock
        where={<>On any movie or show page, click the <span className="font-semibold text-[var(--ratist-red)]">Watch Companion</span> button (<BookOpen className="inline w-3 h-3" /> icon) below the title. Or go straight to <code className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">/movies/[id]/companion</code>.</>}
        why={<>Pause less, follow more. Especially powerful for ensemble films, sequels, and shows you started a year ago.</>}
      />

      <Disclaimer>Tour preview — bios shown here are illustrative samples, not the real Inception companion data.</Disclaimer>

      <InTheWild slot={images.screenshots.companion} />
    </div>
  );
}

// ============= STEP 3: SCREENING ROOM =============
interface SRMessage { id: number; user: string; text?: string; emoji?: string; time: string; isMe?: boolean }
const SR_SEED: SRMessage[] = [
  { id: 1, user: "Sam",   text: "the worm is HERE",                time: "1:14:08" },
  { id: 2, user: "Alex",  emoji: "😱",                             time: "1:14:12" },
  { id: 3, user: "Priya", text: "Zendaya cracking knuckles 😤",    time: "1:14:31" },
  { id: 4, user: "Sam",   emoji: "🔥",                             time: "1:14:42" },
];
const SR_EMOJIS = ["👍", "😱", "😂", "🔥", "❤️"];
// Vote-count-based math (not pre-baked percentages) so a single new
// vote noticeably shifts the bars — important when the room only has
// a handful of viewers.
const SR_POLL = {
  q: "Best scene so far?",
  options: [
    { label: "Sandworm ride",                 baseVotes: 2 },
    { label: "Atreides massacre",             baseVotes: 1 },
    { label: "Stilgar's first appearance",    baseVotes: 1 },
  ],
};

function ScreeningStep({ images }: Props) {
  const [msgs, setMsgs] = useState<SRMessage[]>(SR_SEED);
  const [seq, setSeq] = useState(SR_SEED.length + 1);
  const [vote, setVote] = useState<number | null>(null);
  const dunePoster = tmdbPoster(images.movies.dunePart2, "w154");

  function react(emoji: string) {
    const t = `1:14:${String(45 + seq).padStart(2, "0")}`;
    setMsgs((m) => [...m, { id: seq, user: "You", emoji, time: t, isMe: true }].slice(-7));
    setSeq((n) => n + 1);
  }

  return (
    <div>
      <StepHeader icon={MonitorPlay} title="Screening Room" lead="Movie nights, synced — same scene, same time, different couches." />

      <WhyBlock>
        <p>
          Watching alone is one thing. Watching with three friends who&rsquo;ll text the entire time is a completely
          different experience. Screening Room turns any film into a synced session: everyone hits play together,
          reactions land in real time, and a verdict reveal drops when the credits roll.
        </p>
        <p>
          You can host private rooms with friends or open them up to the community. Bookmark moments, run
          predictions polls, and after the credits everyone&rsquo;s rating drops at once.
        </p>
      </WhyBlock>

      <div className="bg-[var(--surface-2)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-black/40 border-b border-[var(--border)] flex items-center gap-3">
          <PosterThumb src={dunePoster} alt="Dune: Part Two" size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)]">Now screening</p>
            <p className="text-sm font-semibold text-white break-words">Dune: Part Two (2024)</p>
            <p className="text-[10px] text-[var(--foreground-muted)] break-words">5 watching &middot; private room</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-mono text-[var(--ratist-red)]">1:14:32</p>
            <p className="text-[10px] text-[var(--foreground-muted)]">/ 2:46:00</p>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-[var(--border)]">
          {(() => {
            const baseTotal = SR_POLL.options.reduce((a, o) => a + o.baseVotes, 0);
            const total = baseTotal + (vote != null ? 1 : 0);
            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-white font-semibold">{SR_POLL.q}</p>
                  <p className="text-[10px] text-[var(--foreground-muted)]">{total} {total === 1 ? "vote" : "votes"}</p>
                </div>
                <div className="space-y-1.5">
                  {SR_POLL.options.map((o, i) => {
                    const selected = vote === i;
                    const votes = o.baseVotes + (selected ? 1 : 0);
                    const pct = Math.round((votes / total) * 100);
                    return (
                      <button
                        key={i}
                        onClick={() => setVote(i)}
                        className="w-full relative text-left rounded-md overflow-hidden bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)]/40 transition-colors"
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-[var(--ratist-red)]/15 transition-[width] duration-200"
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex justify-between items-center px-2.5 py-1.5">
                          <span className="text-xs text-white flex items-center gap-1.5">
                            {selected && <Check className="w-3 h-3 text-[var(--ratist-red)]" />}
                            {o.label}
                          </span>
                          <span className="text-[10px] text-[var(--foreground-muted)] font-mono">{votes} &middot; {pct}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>

        <div className="px-4 py-3 h-44 overflow-y-auto space-y-1.5">
          {msgs.map((m) => (
            <div key={m.id} className={`flex items-center gap-2 ${m.isMe ? "justify-end" : ""}`}>
              {!m.isMe && <span className="text-[10px] text-[var(--foreground-muted)] font-semibold w-12 truncate">{m.user}</span>}
              <span className="text-[10px] text-[var(--foreground-muted)] font-mono">{m.time}</span>
              {m.emoji ? (
                <span className={`px-2 py-0.5 rounded-md text-base ${m.isMe ? "bg-[var(--ratist-red)]/20" : "bg-[var(--surface)]"}`}>{m.emoji}</span>
              ) : (
                <span className={`px-2.5 py-1 rounded-md text-xs ${m.isMe ? "bg-[var(--ratist-red)]/20 text-white" : "bg-[var(--surface)] text-white"}`}>{m.text}</span>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--border)] px-4 py-3 flex items-center gap-2 justify-center">
          {SR_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => react(e)}
              className="text-2xl p-1.5 rounded-lg bg-[var(--surface)] hover:bg-[var(--border)] hover:scale-110 transition-all"
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <WhereBlock
        where={<>Top nav &rarr; <span className="font-semibold">Tools</span> &rarr; <span className="font-semibold">Screening Room</span>, or go to <code className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">/screening-room</code>. Click <span className="font-semibold">Create session</span> and share the invite link.</>}
        why={<>Movie night with friends across the country. Bookmark moments, predict twists, see everyone&rsquo;s verdict drop at once when it ends.</>}
      />

      <Disclaimer>Tour preview — your reactions and poll vote stay here, no one else is watching with you.</Disclaimer>

      <InTheWild slot={images.screenshots.screening} />
    </div>
  );
}

// ============= STEP 4: FILM DIARY =============
interface DiaryEntry {
  /** Sort key. Higher = more recent. Today = 1000, fixed dates use a stable ordinal. */
  ord: number;
  date: string;
  title: string;
  year: number;
  rating: number;
  movieKey: string;
  isNew?: boolean;
}

const SEED_DIARY: DiaryEntry[] = [
  { ord: 50,  date: "May 5, 2026",  title: "Dune: Part Two",       year: 2024, rating: 8.4, movieKey: "dunePart2" },
  { ord: 46,  date: "May 1, 2026",  title: "Past Lives",           year: 2023, rating: 7.9, movieKey: "pastLives" },
  { ord: 43,  date: "Apr 28, 2026", title: "The Holdovers",        year: 2023, rating: 8.7, movieKey: "holdovers" },
  { ord: 39,  date: "Apr 24, 2026", title: "Anatomy of a Fall",    year: 2023, rating: 8.1, movieKey: "anatomy" },
];
// Each addable option lands at a fixed slot in the diary timeline,
// so adding them produces visually distinct insertions instead of a
// wall of "Today" entries at the top.
const DIARY_OPTIONS: DiaryEntry[] = [
  { ord: 1000, date: "Today",        title: "Poor Things",                year: 2023, rating: 8.3, movieKey: "poorThings" },
  { ord: 48,   date: "May 3, 2026",  title: "Killers of the Flower Moon", year: 2023, rating: 8.0, movieKey: "kotfm" },
  { ord: 45,   date: "Apr 30, 2026", title: "The Zone of Interest",       year: 2023, rating: 7.8, movieKey: "zoneInterest" },
  { ord: 41,   date: "Apr 26, 2026", title: "Oppenheimer",                year: 2023, rating: 8.6, movieKey: "oppenheimer" },
];

function ratingColor(r: number): string {
  if (r >= 8) return "text-emerald-400";
  if (r >= 7) return "text-yellow-300";
  if (r >= 5) return "text-orange-400";
  return "text-[var(--ratist-red)]";
}

function DiaryStep({ images }: Props) {
  const [added, setAdded] = useState<Record<number, boolean>>({});

  const allEntries: DiaryEntry[] = useMemo(() => {
    const fresh: DiaryEntry[] = [];
    DIARY_OPTIONS.forEach((o, i) => {
      if (added[i]) fresh.push({ ...o, isNew: true });
    });
    return [...fresh, ...SEED_DIARY].sort((a, b) => b.ord - a.ord);
  }, [added]);

  function toggle(i: number) { setAdded((a) => ({ ...a, [i]: !a[i] })); }

  return (
    <div>
      <StepHeader icon={BookOpen} title="Film Diary" lead="The running record of your viewing life." />

      <WhyBlock>
        <p>
          Every film you watch is a moment in your life. Your diary is the running log of those moments — when you
          saw it, what you thought, how it landed. Two years from now, you&rsquo;ll thank yourself for keeping it.
        </p>
        <p>
          You can also browse other people&rsquo;s diaries to see what your taste-twins have been watching, sort by
          rating, filter by year, and export the whole thing as a CSV any time you want.
        </p>
      </WhyBlock>

      <div className="bg-[var(--surface-2)] rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)]">Your diary <span className="text-white">({allEntries.length})</span></p>
          <p className="text-[10px] text-[var(--foreground-muted)]">date &middot; title &middot; rating</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
          {allEntries.map((e, i) => (
            <div
              key={`${e.title}-${i}`}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm border-b border-[var(--border)] last:border-b-0 ${e.isNew ? "bg-[var(--ratist-red)]/10" : ""}`}
            >
              <PosterThumb src={tmdbPoster(images.movies[e.movieKey], "w92")} alt={e.title} size="xs" />
              <span className={`w-20 sm:w-24 text-[11px] shrink-0 ${e.isNew ? "text-[var(--ratist-red)] font-semibold" : "text-[var(--foreground-muted)]"}`}>{e.date}</span>
              <span className="flex-1 min-w-0 text-white break-words">
                {e.title} <span className="text-[var(--foreground-muted)]">({e.year})</span>
              </span>
              <span className={`font-mono text-sm shrink-0 ${ratingColor(e.rating)}`}>{e.rating.toFixed(1)}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-[var(--foreground-muted)] mt-5 mb-2">Try adding more — tap to mark as Seen:</p>
        <div className="space-y-1.5">
          {DIARY_OPTIONS.map((o, i) => {
            const isAdded = !!added[i];
            return (
              <button
                key={i}
                onClick={() => toggle(i)}
                className={`w-full flex items-center gap-3 rounded-lg p-2.5 transition-colors text-left border ${isAdded ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/30" : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--ratist-red)]/40"}`}
              >
                <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isAdded ? "bg-[var(--ratist-red)] border-[var(--ratist-red)]" : "border-[var(--border)]"}`}>
                  {isAdded && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <PosterThumb src={tmdbPoster(images.movies[o.movieKey], "w92")} alt={o.title} size="xs" />
                <span className="flex-1 min-w-0 text-sm text-white break-words">{o.title} <span className="text-[var(--foreground-muted)]">({o.year})</span></span>
                <span className={`text-[10px] shrink-0 ${isAdded ? "text-[var(--ratist-red)] font-semibold" : "text-[var(--foreground-muted)]"}`}>{o.date}</span>
                <span className={`font-mono text-xs ${isAdded ? ratingColor(o.rating) : "text-[var(--foreground-muted)]/50"}`}>{o.rating.toFixed(1)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <WhereBlock
        where={<>Click your avatar &rarr; <span className="font-semibold">Diary</span>, or visit <code className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">/seen</code>. Mark Seen on any movie or show page to add an entry — set the watch date and a rating along with it.</>}
        why={<>A complete record of your viewing life. Sortable, searchable, exportable. Plus your ratings power your recommendations and your badges.</>}
      />

      <Disclaimer>Tour preview — checking these boxes won&rsquo;t add anything to your real diary, and the dates/ratings shown are sample data.</Disclaimer>

      <InTheWild slot={images.screenshots.diary} />
    </div>
  );
}

// ============= STEP 5: WHAT ELSE DO I KNOW THEM FROM? =============
interface OtherFilm { movieKey: string; title: string; year: number; rating: number; role: string }
interface ActorOtherCredits { peopleKey: string; actor: string; role: string; films: OtherFilm[] }

const KNIVES_CAST: ActorOtherCredits[] = [
  {
    peopleKey: "daniel", actor: "Daniel Craig", role: "Benoit Blanc",
    films: [
      { movieKey: "skyfall",      title: "Skyfall",       year: 2012, rating: 8.1, role: "James Bond" },
      { movieKey: "casinoRoyale", title: "Casino Royale", year: 2006, rating: 8.4, role: "James Bond" },
      { movieKey: "loganLucky",   title: "Logan Lucky",   year: 2017, rating: 7.6, role: "Joe Bang" },
      { movieKey: "glassOnion",   title: "Glass Onion",   year: 2022, rating: 7.8, role: "Benoit Blanc" },
    ],
  },
  {
    peopleKey: "ana", actor: "Ana de Armas", role: "Marta Cabrera",
    films: [
      { movieKey: "br2049",      title: "Blade Runner 2049", year: 2017, rating: 8.6, role: "Joi" },
      { movieKey: "noTimeToDie", title: "No Time to Die",    year: 2021, rating: 7.0, role: "Paloma" },
      { movieKey: "blonde",      title: "Blonde",            year: 2022, rating: 5.5, role: "Norma Jeane / Marilyn Monroe" },
    ],
  },
  {
    peopleKey: "chris", actor: "Chris Evans", role: "Ransom Drysdale",
    films: [
      { movieKey: "winterSoldier", title: "Captain America: The Winter Soldier", year: 2014, rating: 8.2, role: "Steve Rogers / Captain America" },
      { movieKey: "snowpiercer",   title: "Snowpiercer",                          year: 2013, rating: 7.8, role: "Curtis Everett" },
      { movieKey: "grayMan",       title: "The Gray Man",                         year: 2022, rating: 6.5, role: "Lloyd Hansen" },
    ],
  },
  {
    peopleKey: "jamie", actor: "Jamie Lee Curtis", role: "Linda Drysdale",
    films: [
      { movieKey: "halloween78",   title: "Halloween",                            year: 1978, rating: 7.9, role: "Laurie Strode" },
      { movieKey: "eeaao",         title: "Everything Everywhere All at Once",    year: 2022, rating: 9.2, role: "Deirdre Beaubeirdre" },
      { movieKey: "tradingPlaces", title: "Trading Places",                       year: 1983, rating: 8.0, role: "Ophelia" },
    ],
  },
];

function ActorLookupStep({ images }: Props) {
  const [pick, setPick] = useState(0);
  const c = KNIVES_CAST[pick];
  const knivesPoster = tmdbPoster(images.movies.knivesOut);

  return (
    <div>
      <StepHeader icon={Film} title="What Else Do I Know Them From?" lead="The face you can't quite place — solved in seconds." />

      <WhyBlock>
        <p>
          You&rsquo;re ten minutes into a movie and a familiar face walks on screen. <em>Where</em>{" "}have you seen them? You can&rsquo;t enjoy the next scene because your brain won&rsquo;t let it go. Then you tab over to IMDb, scroll through 80 credits, and three of them spoil whatever you&rsquo;re watching.
        </p>
        <p>
          This tool answers fast — but it only shows films and shows <span className="text-white font-semibold">you&rsquo;ve already seen</span>.
          No 80-credit IMDb scroll. No spoilers from titles you haven&rsquo;t watched. Just the connection you needed.
        </p>
      </WhyBlock>

      <div className="bg-[var(--surface-2)] rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-4">
          <PosterThumb src={knivesPoster} alt="Knives Out" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] mb-0.5">You just watched</p>
            <p className="text-base font-semibold text-white">Knives Out <span className="text-[var(--foreground-muted)] font-normal">(2019)</span></p>
            <p className="text-xs text-[var(--foreground-muted)]">Pick a face you recognized:</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {KNIVES_CAST.map((a, i) => {
            const active = pick === i;
            return (
              <button
                key={i}
                onClick={() => setPick(i)}
                className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-xs border transition-colors ${active ? "bg-[var(--ratist-red)]/15 border-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)]/40 hover:text-white"}`}
              >
                <ProfileAvatar src={tmdbProfile(images.people[a.peopleKey])} alt={a.actor} size="sm" />
                <span className="flex flex-col items-start leading-tight">
                  <span className="font-semibold">{a.actor}</span>
                  <span className="text-[10px] text-[var(--foreground-muted)]">{a.role}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] mb-2.5">
            Other films you&rsquo;ve seen with <span className="text-white font-semibold">{c.actor}</span>
          </p>
          <div className="space-y-1.5">
            {c.films.map((f) => (
              <div key={f.title} className="flex items-center gap-3 px-2.5 py-2 rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
                <PosterThumb src={tmdbPoster(images.movies[f.movieKey], "w92")} alt={f.title} size="xs" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white break-words">{f.title} <span className="text-[var(--foreground-muted)]">({f.year})</span></p>
                  <p className="text-[10px] text-[var(--foreground-muted)] break-words">as {f.role}</p>
                </div>
                <span className={`font-mono text-xs shrink-0 ${ratingColor(f.rating)}`}>{f.rating.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <WhereBlock
        where={<>Top nav &rarr; <span className="font-semibold">Tools</span> &rarr; <span className="font-semibold">What Else Do I Know Them From?</span>, or visit <code className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">/tools/actor-lookup</code>. Search any actor or director.</>}
        why={<>It only shows movies and shows YOU&rsquo;ve seen — no scrolling through 80 IMDb credits, no accidental spoilers from titles you haven&rsquo;t watched yet.</>}
      />

      <Disclaimer>Tour preview — filmographies and ratings shown here are illustrative samples.</Disclaimer>

      <InTheWild slot={images.screenshots.actor} />
    </div>
  );
}

// ============= STEP 6: COMMUNITY =============
interface CommunityCard {
  href: string;
  icon: LucideIcon;
  surface: string;
  color: string;
  border: string;
  bg: string;
  body: React.ReactNode;
  byline: string;
  votes?: { up: number; down: number };
  metaRight?: string;
}

const COMMUNITY_CARDS: CommunityCard[] = [
  {
    href: "/community/hot-takes",
    icon: Flame,
    surface: "Hot Take",
    color: "text-orange-400",
    border: "border-orange-400/40",
    bg: "bg-orange-400/5",
    body: (<>&ldquo;<em>There Will Be Blood</em> is a better film than <em>Citizen Kane</em>, and we should all just admit it.&rdquo;</>),
    byline: "@cinephile_42 · 4d ago",
    votes: { up: 142, down: 38 },
  },
  {
    href: "/community/recast",
    icon: RefreshCw,
    surface: "Recast",
    color: "text-blue-400",
    border: "border-blue-400/40",
    bg: "bg-blue-400/5",
    body: (<>Cast <span className="font-semibold">Cillian Murphy</span> as Hamlet in a 2027 reboot.</>),
    byline: "@stagecraft · 2d ago",
    votes: { up: 89, down: 12 },
  },
  {
    href: "/community/pitches",
    icon: Lightbulb,
    surface: "Pitch",
    color: "text-emerald-400",
    border: "border-emerald-400/40",
    bg: "bg-emerald-400/5",
    body: (<>A heist film set entirely in a single broken elevator over 90 minutes.</>),
    byline: "@one_take · 6d ago",
    votes: { up: 67, down: 91 },
  },
  {
    href: "/community/looks-like",
    icon: Sparkles,
    surface: "Looks Like",
    color: "text-purple-400",
    border: "border-purple-400/40",
    bg: "bg-purple-400/5",
    body: (<>Pedro Pascal looks like Joaquin Phoenix&rsquo;s slightly more serious cousin.</>),
    byline: "@doppels · 1w ago",
    votes: { up: 104, down: 31 },
  },
  {
    href: "/forum",
    icon: MessageSquare,
    surface: "Forum · Theory",
    color: "text-cyan-400",
    border: "border-cyan-400/40",
    bg: "bg-cyan-400/5",
    body: (<>Was the spinning top in <em>Inception</em>&rsquo;s final shot ambiguous on purpose, or was Nolan signaling?</>),
    byline: "@dreamlayer · 4d ago",
    metaRight: "23 replies",
  },
  {
    href: "/community/oscar-picks",
    icon: BarChart2,
    surface: "Oscar Picks",
    color: "text-yellow-400",
    border: "border-yellow-400/40",
    bg: "bg-yellow-400/5",
    body: (<>Predicted Best Picture: <span className="font-semibold">Anatomy of a Fall</span>. Community says 38% agree.</>),
    byline: "Submit before the ceremony",
    metaRight: "12 picks",
  },
];

function CommunityStep({ images }: Props) {
  return (
    <div>
      <StepHeader icon={Users} title="Community" lead="Six different surfaces. People who actually argue about cinema." />

      <WhyBlock>
        <p>
          Everyone has takes. The Ratist is where people who actually argue about cinema hang out — not just rate
          and run. Each community surface does a different thing: declare a hot take, recast a classic, pitch the
          movie you wish existed, theorize in the forums, vote on celebrity lookalikes, predict the Oscars.
        </p>
      </WhyBlock>

      <div className="grid sm:grid-cols-2 gap-3">
        {COMMUNITY_CARDS.map((c) => {
          const Icon = c.icon;
          const net = c.votes ? c.votes.up - c.votes.down : 0;
          const netLabel = c.votes ? `${net > 0 ? "+" : ""}${net}` : "";
          return (
            <div key={c.surface} className={`rounded-xl p-3.5 border ${c.border} ${c.bg}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-3.5 h-3.5 ${c.color}`} />
                <p className={`text-[10px] uppercase tracking-widest font-semibold ${c.color}`}>{c.surface}</p>
              </div>
              <p className="text-sm text-white leading-snug mb-2.5">{c.body}</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-[var(--foreground-muted)] truncate">{c.byline}</p>
                {c.votes ? (
                  <div className="flex items-center gap-1 text-[11px] shrink-0">
                    <ThumbsUp className="w-3 h-3 text-[var(--foreground-muted)]" />
                    <ThumbsDown className="w-3 h-3 text-[var(--foreground-muted)]" />
                    <span className={`font-mono font-semibold ml-0.5 ${net >= 0 ? "text-emerald-400" : "text-[var(--ratist-red)]"}`}>{netLabel}</span>
                  </div>
                ) : c.metaRight ? (
                  <p className="text-[10px] text-[var(--foreground-muted)] shrink-0">{c.metaRight}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <WhereBlock
        where={<>Top nav &rarr; <span className="font-semibold">Community</span>, or hit individual surfaces directly: <code className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">/community/hot-takes</code>, <code className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">/community/recast</code>, <code className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">/forum</code>, etc.</>}
        why={<>Cinephiles arguing about cinema. The good kind of arguing. Earn badges for your contributions, build a profile, find people whose taste you trust.</>}
      />

      <Disclaimer>Tour preview — submissions and vote counts shown above are mock examples for illustration.</Disclaimer>

      <InTheWild slot={images.screenshots.community} />
    </div>
  );
}

// ============= STEP 7: WATCHLIST =============
interface WatchlistEntry {
  movieKey: string;
  title: string;
  year: number;
  runtime: number;
  provider: string;
  /** Tailwind text color for the provider chip — picks up streaming brand cues. */
  providerColor: string;
}
const WATCHLIST_DATA: WatchlistEntry[] = [
  { movieKey: "substance", title: "The Substance", year: 2024, runtime: 141, provider: "Now on Netflix",  providerColor: "text-red-500"    },
  { movieKey: "conclave",  title: "Conclave",      year: 2024, runtime: 120, provider: "In theaters",     providerColor: "text-amber-400"  },
  { movieKey: "civilWar",  title: "Civil War",     year: 2024, runtime: 109, provider: "Now on Max",      providerColor: "text-purple-400" },
  { movieKey: "wicked",    title: "Wicked",        year: 2024, runtime: 160, provider: "Buy on Amazon",   providerColor: "text-yellow-400" },
];

function WatchlistStep({ images }: Props) {
  // Per-item seen state. Cross-out (don't remove) so the user can see
  // the strikethrough effect and undo it.
  const [seenIdx, setSeenIdx] = useState<Set<number>>(new Set());
  const [items, setItems] = useState<WatchlistEntry[]>(WATCHLIST_DATA);

  function moveUp(i: number) {
    if (i === 0) return;
    setItems((arr) => {
      const n = [...arr];
      [n[i - 1], n[i]] = [n[i], n[i - 1]];
      return n;
    });
    // Move the seen marker with the row.
    setSeenIdx((s) => {
      const ns = new Set<number>();
      s.forEach((idx) => {
        if (idx === i) ns.add(i - 1);
        else if (idx === i - 1) ns.add(i);
        else ns.add(idx);
      });
      return ns;
    });
  }
  function moveDown(i: number) {
    setItems((arr) => {
      if (i >= arr.length - 1) return arr;
      const n = [...arr];
      [n[i + 1], n[i]] = [n[i], n[i + 1]];
      return n;
    });
    setSeenIdx((s) => {
      const ns = new Set<number>();
      s.forEach((idx) => {
        if (idx === i) ns.add(i + 1);
        else if (idx === i + 1) ns.add(i);
        else ns.add(idx);
      });
      return ns;
    });
  }
  function toggleSeen(i: number) {
    setSeenIdx((s) => {
      const ns = new Set(s);
      if (ns.has(i)) ns.delete(i);
      else ns.add(i);
      return ns;
    });
  }
  function reset() { setSeenIdx(new Set()); setItems(WATCHLIST_DATA); }

  const dirty = seenIdx.size > 0 || items.some((it, i) => it.movieKey !== WATCHLIST_DATA[i].movieKey);

  return (
    <div>
      <StepHeader icon={Bookmark} title="Watchlists" lead="Your queue of films you don't want to forget about." />

      <WhyBlock>
        <p>
          Found a film you want to see, but tonight isn&rsquo;t the night? Add it to your watchlist. You can keep
          multiple lists side-by-side — a <span className="text-white font-semibold">Rewatch</span> shelf, a
          <span className="text-white font-semibold"> Guys&rsquo; Night</span> queue, a list for the road trip.
          Add collaborators so a partner or a group can build a list together.
        </p>
        <p>
          We&rsquo;ll show where each one is currently streaming so you don&rsquo;t have to google it every time.
          Mark something Seen and it drops out of your queue and into your Diary with today&rsquo;s date.
        </p>
      </WhyBlock>

      <div className="bg-[var(--surface-2)] rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)]">Up next <span className="text-white">({items.length - seenIdx.size} unwatched)</span></p>
          {dirty && (
            <button onClick={reset} className="text-[10px] text-[var(--foreground-muted)] hover:text-white transition-colors">Reset demo</button>
          )}
        </div>

        <div className="space-y-2">
          {items.map((it, i) => {
            const isSeen = seenIdx.has(i);
            return (
              <div
                key={it.movieKey}
                className={`flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2.5 transition-opacity ${isSeen ? "opacity-50" : ""}`}
              >
                <PosterThumb src={tmdbPoster(images.movies[it.movieKey], "w92")} alt={it.title} size="xs" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold text-white break-words ${isSeen ? "line-through" : ""}`}>{it.title} <span className="text-[var(--foreground-muted)] font-normal">({it.year})</span></p>
                  <p className={`text-[10px] text-[var(--foreground-muted)] break-words ${isSeen ? "line-through" : ""}`}>{it.runtime} min &middot; <span className={it.providerColor}>{it.provider}</span></p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={() => toggleSeen(i)}
                    aria-label={isSeen ? "Mark unwatched" : "Mark seen"}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-colors border ${isSeen ? "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300" : "bg-[var(--ratist-red)]/15 hover:bg-[var(--ratist-red)]/30 border-[var(--ratist-red)]/30 text-white"}`}
                  >
                    <Check className="w-3 h-3" /> {isSeen ? "Seen ✓" : "Seen"}
                  </button>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveUp(i)} disabled={i === 0} aria-label="Move up"
                      className="p-1.5 rounded-md bg-[var(--surface-2)] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      <ArrowUp className="w-3 h-3 text-white" />
                    </button>
                    <button onClick={() => moveDown(i)} disabled={i === items.length - 1} aria-label="Move down"
                      className="p-1.5 rounded-md bg-[var(--surface-2)] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      <ArrowDown className="w-3 h-3 text-white" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <WhereBlock
        where={<>Click your avatar &rarr; <span className="font-semibold">Watchlist</span>, or visit <code className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">/watchlist</code>. Tap the bookmark icon on any movie or show to add it. Create new lists from the watchlist page header.</>}
        why={<>Stop forgetting the films you wanted to see. No more googling where something is streaming, no more endless scrolling when you finally sit down to pick something.</>}
      />

      <Disclaimer>Tour preview — reordering and Seen toggles here don&rsquo;t change anything on your real account.</Disclaimer>

      <InTheWild slot={images.screenshots.watchlist} />
    </div>
  );
}

// ============= STEP 8: WHAT SHOULD I WATCH? =============
// Mini 3-question questionnaire mirroring the real /tools/recommend
// flow. Genre options (subset of 18), Experience values, and Runtime
// values match the live tool exactly so the demo feels faithful.
const REC_GENRES = [
  { key: "Action",         emoji: "💥" },
  { key: "Drama",          emoji: "🎭" },
  { key: "Comedy",         emoji: "😂" },
  { key: "Science Fiction",emoji: "🛸" },
  { key: "Horror",         emoji: "🩸" },
  { key: "Mystery",        emoji: "🔍" },
];
const REC_EXPERIENCE = [
  { key: "popular",    label: "Something popular",  desc: "Trending and widely talked about" },
  { key: "hidden_gem", label: "A hidden gem",       desc: "Highly rated but lesser known" },
  { key: "classic",    label: "A certified classic",desc: "Timeless titles that defined the medium" },
];
const REC_RUNTIME = [
  { key: "short",    label: "Quick watch",      desc: "Under 100 minutes" },
  { key: "standard", label: "Standard",         desc: "Around 90–140 minutes" },
  { key: "long",     label: "I'm settling in",  desc: "2.5 hours or more" },
];

interface RecResult { movieKey: string; title: string; year: number; blurb: string }
// Results are keyed by experience choice — mirrors how the real engine
// weighs popularity-vs-hidden-gem signals heaviest. Genre and runtime
// nudge the blurb but the headline picks come from experience.
const REC_RESULTS: Record<string, RecResult[]> = {
  popular: [
    { movieKey: "inception",  title: "Inception",                        year: 2010, blurb: "Nolan's heist-in-a-dream that everyone has an opinion on." },
    { movieKey: "eeaao",      title: "Everything Everywhere All at Once",year: 2022, blurb: "Multiverse action with a beating heart. Won 7 Oscars." },
    { movieKey: "knivesOut",  title: "Knives Out",                       year: 2019, blurb: "The whodunit revival that earned its sequels." },
  ],
  hidden_gem: [
    { movieKey: "pastLives", title: "Past Lives",         year: 2023, blurb: "A24 quiet stunner. Three timezones, one decision." },
    { movieKey: "anatomy",   title: "Anatomy of a Fall",  year: 2023, blurb: "Two-and-a-half hours of marriage on trial. Magnetic." },
    { movieKey: "holdovers", title: "The Holdovers",      year: 2023, blurb: "1970s prep school over Christmas break. Just trust it." },
  ],
  classic: [
    { movieKey: "halloween78",   title: "Halloween",       year: 1978, blurb: "Carpenter's blueprint. Every slasher since is a footnote." },
    { movieKey: "tradingPlaces", title: "Trading Places",  year: 1983, blurb: "Aykroyd, Murphy, and a dollar bet on human nature." },
    { movieKey: "toyStory",      title: "Toy Story",       year: 1995, blurb: "The film that proved CGI could carry a feature." },
  ],
};

function RecommendStep({ images }: Props) {
  const [genres, setGenres] = useState<Set<string>>(new Set());
  const [experience, setExperience] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = genres.size > 0 && experience != null && runtime != null;
  const results = experience ? REC_RESULTS[experience] : [];

  function toggleGenre(g: string) {
    setGenres((s) => {
      const ns = new Set(s);
      if (ns.has(g)) ns.delete(g);
      else ns.add(g);
      return ns;
    });
    setSubmitted(false);
  }
  function reset() {
    setGenres(new Set());
    setExperience(null);
    setRuntime(null);
    setSubmitted(false);
  }

  return (
    <div>
      <StepHeader icon={Wand2} title="What Should I Watch?" lead="A short questionnaire when you don't know what you want." />

      <WhyBlock>
        <p>
          Sometimes you don&rsquo;t want a sharp recommendation tuned to your taste fingerprint. You just want a
          quick &ldquo;I&rsquo;m in this mood, what fits?&rdquo; answer. The real tool walks you through six
          questions; the demo below shows three of them.
        </p>
        <p>
          Different from your For You feed: this one is one-shot, doesn&rsquo;t need rating history, and tunes
          to your <em>current</em> state of mind — not your overall taste.
        </p>
      </WhyBlock>

      <div className="bg-[var(--surface-2)] rounded-xl p-4 sm:p-5 space-y-5">
        {/* Q1: Genre */}
        <div>
          <p className="text-sm font-semibold text-white mb-1">What are you in the mood for?</p>
          <p className="text-[11px] text-[var(--foreground-muted)] mb-2.5">Pick one or more genres.</p>
          <div className="flex flex-wrap gap-1.5">
            {REC_GENRES.map((g) => {
              const on = genres.has(g.key);
              return (
                <button
                  key={g.key}
                  onClick={() => toggleGenre(g.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${on ? "bg-[var(--ratist-red)]/15 border-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)]/40 hover:text-white"}`}
                >
                  <span className="text-sm leading-none">{g.emoji}</span>
                  {g.key}
                </button>
              );
            })}
          </div>
        </div>

        {/* Q2: Experience */}
        <div>
          <p className="text-sm font-semibold text-white mb-1">What kind of experience?</p>
          <p className="text-[11px] text-[var(--foreground-muted)] mb-2.5">Pick one.</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {REC_EXPERIENCE.map((opt) => {
              const on = experience === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => { setExperience(opt.key); setSubmitted(false); }}
                  className={`text-left p-3 rounded-lg border transition-colors ${on ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]" : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--ratist-red)]/40"}`}
                >
                  <p className="text-xs font-semibold text-white">{opt.label}</p>
                  <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5 leading-tight">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Q3: Runtime */}
        <div>
          <p className="text-sm font-semibold text-white mb-1">How much time do you have?</p>
          <p className="text-[11px] text-[var(--foreground-muted)] mb-2.5">Pick one.</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {REC_RUNTIME.map((opt) => {
              const on = runtime === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => { setRuntime(opt.key); setSubmitted(false); }}
                  className={`text-left p-3 rounded-lg border transition-colors ${on ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]" : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--ratist-red)]/40"}`}
                >
                  <p className="text-xs font-semibold text-white">{opt.label}</p>
                  <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5 leading-tight">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={reset}
            disabled={!canSubmit && !submitted && genres.size === 0}
            className="text-[11px] text-[var(--foreground-muted)] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            onClick={() => setSubmitted(true)}
            disabled={!canSubmit}
            className="px-4 py-2 text-xs font-semibold bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Get recommendations →
          </button>
        </div>

        {submitted && (
          <div className="space-y-2 pt-3 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--foreground-muted)]">Three picks for you:</p>
            {results.map((r) => (
              <div key={r.movieKey} className="flex gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
                <PosterThumb src={tmdbPoster(images.movies[r.movieKey], "w92")} alt={r.title} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{r.title} <span className="text-[var(--foreground-muted)] font-normal">({r.year})</span></p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5 leading-snug">{r.blurb}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <WhereBlock
        where={<>Top nav &rarr; <span className="font-semibold">Tools</span> &rarr; <span className="font-semibold">What Should I Watch?</span>, or visit <code className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">/tools/recommend</code>. The full questionnaire adds media type, era, and exclude-genre questions on top of these three.</>}
        why={<>For the nights when you don&rsquo;t want to think. Six quick taps, three picks back, hit play.</>}
      />

      <Disclaimer>Tour preview — recommendations shown are illustrative, not from the live engine.</Disclaimer>

      <InTheWild slot={images.screenshots.recommend} />
    </div>
  );
}

// ============= STEP 9: COLLECTIONS =============
interface CollectionItem { movieKey: string; title: string; year: number }
interface CollectionDef {
  title: string;
  curator: string;
  matchScore: number;
  blurb: string;
  items: CollectionItem[];
}
const COLLECTIONS: CollectionDef[] = [
  {
    title: "Heists That Stick the Landing", curator: "@cinephile_42", matchScore: 88,
    blurb: "Films where the plan goes sideways and the writing earns it.",
    items: [
      { movieKey: "oceansEleven", title: "Ocean's Eleven", year: 2001 },
      { movieKey: "heat",         title: "Heat",            year: 1995 },
      { movieKey: "insideMan",    title: "Inside Man",      year: 2006 },
      { movieKey: "babyDriver",   title: "Baby Driver",     year: 2017 },
      { movieKey: "loganLucky",   title: "Logan Lucky",     year: 2017 },
    ],
  },
  {
    title: "The 2023 Best Picture Race", curator: "Admin", matchScore: 67,
    blurb: "Last year's nominees, ranked by the Ratist community.",
    items: [
      { movieKey: "anatomy",      title: "Anatomy of a Fall",     year: 2023 },
      { movieKey: "holdovers",    title: "The Holdovers",          year: 2023 },
      { movieKey: "oppenheimer",  title: "Oppenheimer",            year: 2023 },
      { movieKey: "zoneInterest", title: "The Zone of Interest",   year: 2023 },
      { movieKey: "pastLives",    title: "Past Lives",             year: 2023 },
    ],
  },
  {
    title: "Hits On Every Axis", curator: "@auteurd", matchScore: 91,
    blurb: "Films that score high across all five categories. Story, style, all of it.",
    items: [
      { movieKey: "inception", title: "Inception",                         year: 2010 },
      { movieKey: "eeaao",     title: "Everything Everywhere All at Once", year: 2022 },
      { movieKey: "parasite",  title: "Parasite",                          year: 2019 },
      { movieKey: "holdovers", title: "The Holdovers",                     year: 2023 },
      { movieKey: "toyStory",  title: "Toy Story",                         year: 1995 },
    ],
  },
];

function matchColor(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-yellow-300";
  return "text-orange-400";
}

function CollectionsStep({ images }: Props) {
  return (
    <div>
      <StepHeader icon={Layers} title="Collections" lead="Curated movie lists, scored against your taste." />

      <WhyBlock>
        <p>
          Every &ldquo;best of&rdquo; list on the internet treats every reader the same. Collections here are
          different: each one gets a <span className="text-white font-semibold">match score</span>{" "}against
          your taste fingerprint. You spot the lists actually worth your time before the ones that aren&rsquo;t.
        </p>
        <p>
          Browse Admin picks, follow other curators, or build your own. Match scores update as you rate more films,
          so a list that&rsquo;s 60% match today might become 84% next month.
        </p>
      </WhyBlock>

      <div className="space-y-3">
        {COLLECTIONS.map((c) => (
          <div key={c.title} className="bg-[var(--surface-2)] rounded-xl p-4 border border-[var(--border)]">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{c.title}</p>
                <p className="text-[10px] text-[var(--foreground-muted)]">by <span className="text-white">{c.curator}</span> &middot; {c.items.length} films</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1.5 italic">&ldquo;{c.blurb}&rdquo;</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-widest text-[var(--ratist-red)] font-semibold">Match</p>
                <p className={`text-2xl font-bold leading-none ${matchColor(c.matchScore)}`}>{c.matchScore}<span className="text-xs text-[var(--foreground-muted)] font-normal">%</span></p>
              </div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {c.items.map((it) => (
                <div key={it.movieKey} className="shrink-0">
                  <PosterThumb src={tmdbPoster(images.movies[it.movieKey], "w92")} alt={it.title} size="sm" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <WhereBlock
        where={<>Top nav &rarr; <span className="font-semibold">Tools</span> &rarr; <span className="font-semibold">Collections</span>, or visit <code className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">/tools/collections</code>. The home tabs let you switch between Featured, Following, Community, and your own.</>}
        why={<>Curated lists you can trust. The match score does the filtering for you, so you don&rsquo;t waste a Friday night on a list that&rsquo;s not for you.</>}
      />

      <Disclaimer>Tour preview — collections and match scores shown above are mock examples.</Disclaimer>

      <InTheWild slot={images.screenshots.collections} />
    </div>
  );
}

// ============= STEP 10: SHARED CAST & CREW =============
const SC_FILMS: { key: string; title: string; year: number }[] = [
  { key: "inception",    title: "Inception",    year: 2010 },
  { key: "interstellar", title: "Interstellar", year: 2014 },
  { key: "tenet",        title: "Tenet",        year: 2020 },
  { key: "oppenheimer",  title: "Oppenheimer",  year: 2023 },
];
// Per-film cast/crew rosters used to compute the intersection live.
// Nolan is in all 4; the others have varying overlap so the demo can
// show different intersections as the user toggles selections.
const SC_PEOPLE: Record<string, { peopleKey: string; name: string; role: string }[]> = {
  inception: [
    { peopleKey: "nolan",  name: "Christopher Nolan", role: "Director, Writer" },
    { peopleKey: "murphy", name: "Cillian Murphy",    role: "Robert Fischer" },
    { peopleKey: "caine",  name: "Michael Caine",     role: "Miles" },
    { peopleKey: "zimmer", name: "Hans Zimmer",       role: "Composer" },
  ],
  interstellar: [
    { peopleKey: "nolan",  name: "Christopher Nolan", role: "Director, Writer" },
    { peopleKey: "caine",  name: "Michael Caine",     role: "Professor Brand" },
    { peopleKey: "zimmer", name: "Hans Zimmer",       role: "Composer" },
  ],
  tenet: [
    { peopleKey: "nolan",  name: "Christopher Nolan", role: "Director, Writer" },
    { peopleKey: "caine",  name: "Michael Caine",     role: "Sir Michael Crosby" },
  ],
  oppenheimer: [
    { peopleKey: "nolan",  name: "Christopher Nolan", role: "Director, Writer" },
    { peopleKey: "murphy", name: "Cillian Murphy",    role: "J. Robert Oppenheimer" },
  ],
};

function SharedCastStep({ images }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["inception", "interstellar"]));

  function toggle(key: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) {
        if (next.size <= 2) return cur;  // tool needs at least 2 selected
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  // Compute people who appear in EVERY selected film.
  const sharedPeople = useMemo(() => {
    const arr = [...selected];
    if (arr.length < 2) return [];
    const firstRoster = SC_PEOPLE[arr[0]] ?? [];
    return firstRoster
      .filter((p) =>
        arr.every((film) => (SC_PEOPLE[film] ?? []).some((pp) => pp.peopleKey === p.peopleKey))
      )
      .map((p) => ({
        peopleKey: p.peopleKey,
        name: p.name,
        rolesByFilm: arr.map((film) => ({
          film,
          role: (SC_PEOPLE[film] ?? []).find((pp) => pp.peopleKey === p.peopleKey)?.role ?? "",
        })),
      }));
  }, [selected]);

  return (
    <div>
      <StepHeader icon={Users} title="Shared Cast & Crew" lead="Pick movies you've seen, find who's in all of them." />

      <WhyBlock>
        <p>
          You watch a Nolan film. Then another Nolan film. Then you wonder: who keeps showing up across his work?
          This tool answers that — pick 2&ndash;4 movies (or 2&ndash;6 people) and see exactly who or what they
          share.
        </p>
        <p>
          Inverse of step 5 (&ldquo;What Else Do I Know Them From?&rdquo;): instead of one actor &rarr; many films,
          this is many films &rarr; shared cast and crew. Sortable by overlap count.
        </p>
      </WhyBlock>

      <div className="bg-[var(--surface-2)] rounded-xl p-4 sm:p-5">
        <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Pick films you&rsquo;ve seen <span className="text-white">({selected.size}/{SC_FILMS.length})</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          {SC_FILMS.map((f) => {
            const isSel = selected.has(f.key);
            return (
              <button
                key={f.key}
                onClick={() => toggle(f.key)}
                className={`relative flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors ${isSel ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/50" : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--ratist-red)]/30"}`}
              >
                <PosterThumb src={tmdbPoster(images.movies[f.key], "w92")} alt={f.title} size="sm" />
                <p className="text-[10px] text-white text-center leading-tight">{f.title}</p>
                <p className="text-[9px] text-[var(--foreground-muted)]">({f.year})</p>
                {isSel && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--ratist-red)] flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">
            Shared across your selection <span className="text-white">({sharedPeople.length})</span>
          </p>
          {sharedPeople.length === 0 ? (
            <p className="text-xs text-[var(--foreground-muted)] italic py-2">No cast or crew appears in every film you&rsquo;ve picked. Try a different selection.</p>
          ) : (
            <div className="space-y-2">
              {sharedPeople.map((p) => (
                <div key={p.peopleKey} className="flex items-start gap-3 bg-[var(--surface)] rounded-lg p-3 border border-[var(--border)]">
                  <ProfileAvatar src={tmdbProfile(images.people[p.peopleKey])} alt={p.name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{p.name}</p>
                    <div className="space-y-0.5 mt-1">
                      {p.rolesByFilm.map((rf) => (
                        <p key={rf.film} className="text-[10px] text-[var(--foreground-muted)]">
                          <span className="text-white">{SC_FILMS.find((ff) => ff.key === rf.film)?.title}</span>
                          {" — "}{rf.role}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <WhereBlock
        where={<>Top nav &rarr; <span className="font-semibold">Tools</span> &rarr; <span className="font-semibold">Shared Cast &amp; Crew</span>, or visit <code className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">/tools/shared-cast</code>. Pick films <em>or</em> pick people — both directions work.</>}
        why={<>Find the connective tissue between films you love. Discover who keeps showing up in every Coen film, every A24 release, every project you can&rsquo;t put down.</>}
      />

      <Disclaimer>Tour preview — selections here don&rsquo;t affect anything in the real tool.</Disclaimer>

      <InTheWild slot={images.screenshots.sharedCast} />
    </div>
  );
}

// ============= COMPLETION =============
function CompletionScreen({ extended }: { extended: boolean }) {
  return (
    <div className="max-w-md mx-auto px-4 py-16 sm:py-20 text-center">
      <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[var(--ratist-red)]/20 border border-[var(--ratist-red)]/30 flex items-center justify-center">
        <Sparkles className="w-8 h-8 text-[var(--ratist-red)]" />
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">You&rsquo;re all set</h2>
      <p className="text-sm text-[var(--foreground-muted)] mb-8">
        {extended
          ? "You’ve seen the full lineup. There’s more buried in the app, but you’ll find it as you go. Now do it for real."
          : "That’s the gist of it. Now do it for real — browse a film, rate something honestly, follow whoever’s interesting."}
      </p>
      <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
        <Link
          href="/movies"
          className="px-5 py-2.5 text-sm font-semibold bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-lg transition-colors"
        >
          Browse movies
        </Link>
        <Link
          href="/"
          className="px-5 py-2.5 text-sm font-semibold bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--border)] text-white rounded-lg transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
