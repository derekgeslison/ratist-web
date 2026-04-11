import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { Star, BarChart3, Users, Swords, Film, Brain, Shield, Zap, Tv, Sparkles, RefreshCw, Map } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description: "Why The Ratist exists — and why traditional movie and TV show ratings are broken.",
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
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
          If plot doesn&apos;t matter to you as much as visual effects, or if you value artistic elements but don&apos;t care about character development, The Ratist lets you find movies and shows that are made for <span className="text-white font-medium">you</span>.
        </p>
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
            { icon: BarChart3, title: "Deep ratings", desc: "Rate movies and TV shows across 20+ criteria. Quick mode for a fast score, Critic mode for detailed commentary.", href: null },
            { icon: Film, title: "Diary", desc: "Track every movie and episode you watch with calendar views, monthly lists, and shareable year-in-review stats.", href: "/seen" },
            { icon: Tv, title: "TV show tracking", desc: "Mark individual episodes as seen, track seasons, and rate shows at the series or season level.", href: "/movies?type=tv" },
            { icon: Users, title: "Taste matching", desc: "See how your taste compares to friends and other users. Find people who like the same things you do.", href: null },
            { icon: Swords, title: "Matchups", desc: "Compare any two movies or shows head-to-head across every rating category.", href: "/tools/matchup" },
            { icon: Star, title: "Score estimates", desc: "See a predicted score for any movie or show before you watch it, based on your taste profile.", href: null },
            { icon: Sparkles, title: "What Should I Watch?", desc: "Get personalized recommendations filtered by genre, streaming service, era, and your mood.", href: "/tools/recommend" },
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
          The Ratist isn&apos;t just a rating tool — it&apos;s a community for people who care about movies and TV. Read and write reviews with threaded comments, follow other users, and engage with features built for discussion and fun.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: Swords, title: "Punch & Judy", desc: "Head-to-head debates and contrarian takes.", href: "/punch-and-judy" },
            { icon: Map, title: "Movie Maps", desc: "Curated viewing guides and themed lists.", href: "/movie-maps" },
            { icon: RefreshCw, title: "Recasts", desc: "Suggest who should have played that role.", href: "/community/recast" },
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
