import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { Star, BarChart3, Users, Film, Brain, Shield, Zap, Tv, Sparkles, RefreshCw, Map, TrendingUp, Calendar, Eye, Award, MessageSquare, Video, Newspaper, Ticket, HelpCircle } from "lucide-react";
import TwoThumbsIcon from "@/components/TwoThumbsIcon";

export const metadata: Metadata = {
  title: "About",
  description: "Why The Ratist exists — and why traditional movie and TV show ratings are broken.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <div className="text-center mb-16">
        <Image src="/logo-full.png" alt="The Ratist" width={180} height={90} className="h-16 w-auto mx-auto mb-6" />
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-4">
          Movie &amp; TV ratings, done right.
        </h1>
        <p className="text-lg text-[var(--foreground-muted)] max-w-2xl mx-auto leading-relaxed">
          Traditional ratings are fundamentally broken. One number can&apos;t capture why a film or show works for one person and not another. The Ratist was built to fix that.
        </p>
      </div>

      {/* The Problem */}
      <section className="mb-16">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Shield className="w-5 h-5 text-[var(--ratist-red)]" />
          The problem with ratings today
        </h2>
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
            <h3 className="text-sm font-bold text-white mb-2">Rotten Tomatoes</h3>
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
              A binary thumbs up/down from critics, aggregated into a percentage. A movie with 100% could mean every critic thought it was &ldquo;just okay.&rdquo; The score tells you consensus, not quality — and critic priorities rarely match yours.
            </p>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
            <h3 className="text-sm font-bold text-white mb-2">IMDb</h3>
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
              A single 1-10 score from anyone with an account. Heavily gamed by fan campaigns and review bombing. No insight into what makes a movie or show good or bad — just a number with no context.
            </p>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
            <h3 className="text-sm font-bold text-white mb-2">Traditional critic reviews</h3>
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
              Often devolve into plot summaries with spoilers and attempts at wit. The purpose of a review is to help you decide if something is worth your time — most reviews fail at this.
            </p>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
            <h3 className="text-sm font-bold text-white mb-2">Streaming algorithms</h3>
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
              Netflix assumes that because you watched something, you liked it — and that you want more of that genre. You might have loved The Irishman for its cinematography, not because it&apos;s a crime movie.
            </p>
          </div>
        </div>
      </section>

      {/* The Ratist Approach */}
      <section className="mb-16">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Star className="w-5 h-5 text-[var(--ratist-red)]" />
          The Ratist approach
        </h2>
        <div className="bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-8 mb-8">
          <p className="text-base text-[var(--foreground-muted)] leading-relaxed mb-6">
            Since everyone values different things in movies and TV shows, our rubric breaks them down across multiple dimensions so you can make decisions based on <span className="text-white font-semibold">what you actually care about</span>.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { label: "Story & Narrative", desc: "Plot, pacing, originality, character development" },
              { label: "Production & Style", desc: "Cinematography, visuals, music, artistic effect" },
              { label: "Emotive Impact", desc: "Emotional resonance, meaning, relatability" },
              { label: "Performance", desc: "Acting quality, casting, dialogue" },
              { label: "Entertainment", desc: "Appeal, rewatchability, overall enjoyment" },
              { label: "Your Overall", desc: "Your gut feeling — the score that represents you" },
            ].map((c) => (
              <div key={c.label} className="bg-black/20 rounded-lg p-4">
                <p className="text-sm font-semibold text-white mb-1">{c.label}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-8">
          If plot doesn&apos;t matter to you as much as visual effects, or if you value artistic elements but don&apos;t care about character development, The Ratist lets you find movies and shows that are made for <span className="text-white font-medium">you</span>.
        </p>

        {/* Methodology — explains the approach without exposing weights or the formula */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8">
          <h3 className="text-base font-bold text-white mb-3">How a Ratist rating becomes your rating</h3>
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-3">
            When you rate a film, you don&apos;t just give it a star. You score it across the five categories, each broken down into specific sub-fields. Did the plot work? How was the acting quality? The dialogue, the cinematography, the score, the choreography of the action sequences? The deeper the rating, the more signal the algorithm has to work with.
          </p>
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-3">
            From every rating you submit, we build a personal taste profile that captures which categories — and which sub-fields within them — actually matter to you. Some viewers care more about narrative; some care more about visual style. The profile reflects <span className="text-white font-medium">your</span> priorities, not a critic&apos;s, not the average viewer&apos;s.
          </p>
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-3">
            For films and shows you haven&apos;t seen yet, the algorithm uses your profile to predict the score <span className="text-white font-semibold">you</span> would give. That&apos;s your personalized Ratist Rating — and it sharpens every time you rate something new.
          </p>
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
            Basic raters give a quick 1–10 score plus an optional comment. Fanatics raters fill out the full rubric and feed the algorithm richer signal. Either way, your ratings power recommendations and predictions tailored specifically to you.
          </p>
        </div>
      </section>

      {/* The Algorithm */}
      <section className="mb-16">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Brain className="w-5 h-5 text-[var(--ratist-red)]" />
          Recommendations that actually work
        </h2>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 mb-6">
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-4">
            Our algorithm makes recommendations based on your <span className="text-white font-semibold">actual ratings</span>, not just what you&apos;ve watched. The more detailed ratings you provide, the better it understands what you value — and the more accurate your personalized score estimates become.
          </p>
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
            We build a unique <span className="text-white font-medium">taste profile</span> for every user that captures which components of cinema matter most to them. This profile drives everything: your personalized score estimates, recommendations, and taste matching with other users.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mb-16">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Zap className="w-5 h-5 text-[var(--ratist-red)]" />
          What you can do on The Ratist
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: BarChart3, title: "Deep ratings", desc: "Rate movies and TV shows across 20+ criteria. Quick mode for a fast score, Fanatics mode for detailed commentary.", href: null },
            { icon: Star, title: "Score estimates", desc: "See a predicted score for any movie or show before you watch it, based on your taste profile and similar users.", href: null },
            { icon: Sparkles, title: "AI recommendations", desc: "Three AI tools — natural-language recommendations, custom collections, and AI movie search. Tell it what you want, get it.", href: "/tools/recommend" },
            { icon: Film, title: "Diary", desc: "Track every movie and episode you watch with calendar views, monthly lists, and shareable year-in-review stats.", href: "/seen" },
            { icon: Tv, title: "TV show tracking", desc: "Mark individual episodes as seen, track seasons, and rate shows at the series or season level.", href: "/movies?type=tv" },
            { icon: TrendingUp, title: "Box Office Insights", desc: "All-time leaderboards, year-by-year top earners, franchise totals, studio rankings, and ROI champions across decades of film history.", href: "/box-office" },
            { icon: Calendar, title: "Release Calendar", desc: "Upcoming theatrical releases, digital launches, and streaming additions. Filterable by region, genre, MPA rating, and time horizon.", href: "/releases" },
            { icon: Newspaper, title: "News & trailers", desc: "Editorial articles, fresh trailers auto-detected from TMDB, and headlines from Deadline, Variety, THR, Collider, and Screen Rant.", href: "/news" },
            { icon: Eye, title: "Watch Companion", desc: "Live, scene-aware annotations as you watch — explanations, trivia, and answers to common confusions, available on demand.", href: null },
            { icon: Users, title: "Taste matching", desc: "See how your taste compares to friends and other users. Follow people, build feeds, and find users who like the same things you do.", href: "/connections" },
            { icon: Award, title: "Badge system", desc: "43 badges across 12 categories — milestone, taste, community, and rare achievements. Auto-awarded as you rate, watch, and engage.", href: "/badges" },
            { icon: Brain, title: "Smart import", desc: "Bring your Letterboxd or IMDb history in seconds. Your ratings contribute to your profile immediately.", href: "/profile/import" },
          ].map(({ icon: Icon, title, desc, href }) => {
            const content = (
              <>
                <Icon className="w-5 h-5 text-[var(--ratist-red)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-white mb-1">{title}</p>
                  <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">{desc}</p>
                </div>
              </>
            );
            const cls = "flex gap-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--ratist-red)] transition-colors";
            return href ? (
              <Link key={title} href={href} className={cls}>{content}</Link>
            ) : (
              <div key={title} className={cls}>{content}</div>
            );
          })}
        </div>
      </section>

      {/* Community */}
      <section className="mb-16">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Users className="w-5 h-5 text-[var(--ratist-red)]" />
          Community
        </h2>
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-4">
          The Ratist isn&apos;t just a rating tool — it&apos;s a community for people who care about movies and TV. Read and write reviews with threaded comments, follow other users, debate and discuss, watch together, and play.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: MessageSquare, title: "Forum", desc: "Long-form discussion, theory threads, polls, recommendation requests, and structured debates. With media linking, reactions, and follow-thread notifications.", href: "/forum" },
            { icon: HelpCircle, title: "Cine-Q Trivia", desc: "Daily movie trivia with weighted difficulty scoring. Climb the global leaderboard, earn badges, and prove you really know your cinema.", href: "/community/cineq" },
            { icon: Video, title: "Screening Room", desc: "A social watch-together tool. Sync up with friends, chat in real time, and rate together at the end.", href: "/screening-room" },
            { icon: TwoThumbsIcon, title: "Two Thumbs", desc: "Structured for/against debates per movie. Read both sides, submit your own arguments, and vote on the verdict.", href: "/posts?type=PUNCH_AND_JUDY" },
            { icon: Map, title: "Movie Maps", desc: "Visual guides for confusing or branching narratives, plus curated viewing lists and themed deep-dives.", href: "/posts?type=MOVIE_MAP" },
            { icon: RefreshCw, title: "Recasts", desc: "Suggest who should have played that role — the community votes on the best alternate casting.", href: "/community/recast" },
            { icon: Sparkles, title: "Looks Like", desc: "Celebrity lookalike pairs — vote on who could be twins.", href: "/community/looks-like" },
          ].map(({ icon: Icon, title, desc, href }) => (
            <Link key={title} href={href} className="flex gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--ratist-red)] transition-colors">
              <Icon className="w-4 h-4 text-[var(--ratist-red)] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-white mb-0.5">{title}</p>
                <p className="text-[10px] text-[var(--foreground-muted)] leading-relaxed">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Backstage Pass */}
      <section className="mb-16">
        <div className="bg-gradient-to-br from-[var(--ratist-red)]/15 via-[var(--surface)] to-[var(--surface-2)] border border-[var(--ratist-red)]/40 rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
            <Ticket className="w-5 h-5 text-[var(--ratist-red)]" />
            Backstage Pass
          </h2>
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-4">
            The Ratist is free. Backstage Pass is for the people who want more — an ad-free experience plus access to power-user surfaces: deep personal analytics, custom collections, Critics Mode for reviewer-grade rating breakdowns, custom themes, host privileges in the Screening Room, and the curated weekly Movie Club.
          </p>
          <Link
            href="/backstage-pass"
            className="inline-block text-[var(--ratist-red)] text-sm font-semibold hover:underline"
          >
            Learn more about Backstage Pass &rarr;
          </Link>
        </div>
      </section>

      {/* CTA */}
      <div className="text-center py-12 border-t border-[var(--border)]">
        <h2 className="text-2xl font-bold text-white mb-3">Ready to rate the right way?</h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-6">Free to use. Better data. Go Pro for an ad-free experience.</p>
        <div className="flex items-center justify-center gap-4">
          <SignInLink
            className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold px-8 py-3 rounded-full transition-colors"
          >
            Get started
          </SignInLink>
          <Link
            href="/movies"
            className="border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] font-semibold px-8 py-3 rounded-full transition-colors"
          >
            Browse movies &amp; shows
          </Link>
        </div>
      </div>
    </div>
  );
}
