"use client";

import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { Ticket, Check, X, Gift, Star, BarChart3, MonitorPlay, Palette, Shield, Sparkles, ArrowRight } from "lucide-react";

const FEATURES = [
  { name: "Rate & review movies and TV shows", free: true, pass: true },
  { name: "Personal watchlists & rankings", free: true, pass: true },
  { name: "Community features (Hot Takes, Recast, Pitches, etc.)", free: true, pass: true },
  { name: "For You personalized recommendations", free: true, pass: true },
  { name: "Cine-Q daily trivia", free: true, pass: true },
  { name: "Cinephile tools (What Should I Watch?, Shared Cast & Crew, The Matchup, and more)", free: true, pass: true },
  { name: "Join Screening Room sessions", free: true, pass: true },
  { name: "Host Screening Room sessions", free: false, pass: true, icon: MonitorPlay, href: "/backstage-pass/screening-room" },
  { name: "Movie Club", free: false, pass: true, icon: Star, href: "/backstage-pass/movie-club" },
  { name: "My Analytics (detailed viewing stats)", free: false, pass: true, icon: BarChart3, href: "/backstage-pass/analytics" },
  { name: "Collections (curated recommendations)", free: false, pass: true, icon: Sparkles, href: "/backstage-pass/collections" },
  { name: "Critics Mode (250+ reviews required)", free: false, pass: true, icon: Star, href: "/backstage-pass/critics-mode" },
  { name: "Live Review feature", free: false, pass: true, icon: Star, href: "/backstage-pass/critics-mode" },
  { name: "Custom profile themes & colors", free: false, pass: true, icon: Palette, href: "/backstage-pass/custom-themes" },
  { name: "Ad-free experience", free: false, pass: true, icon: Shield },
];

const QUALIFYING_RULES = [
  "You must be one of the first 1,000 users to complete the challenge.",
  "Write 10 full Ratist reviews using the Ratist rating rubric (not quick ratings or imports).",
  "Reviews must be for 10 different movies or TV shows.",
  "Your account must be in good standing (no bans or violations).",
  "The 6-month Backstage Pass will be automatically applied once you hit 10 qualifying reviews.",
  "This promotion can only be redeemed once per account.",
];

export default function First1000PromoPage() {
  const { user } = useAuth();
  const { hasPass } = useSubscription();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-amber-400/20 to-[var(--ratist-red)]/20 border border-amber-400/30 mb-6">
          <Gift className="w-10 h-10 text-amber-400" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
          First 1,000 Reviewers Get <span className="text-amber-400">6 Months Free</span>
        </h1>
        <p className="text-lg text-[var(--foreground-muted)] max-w-2xl mx-auto">
          Be one of the first 1,000 users to write 10 Ratist reviews and unlock a free 6-month Backstage Pass — our premium membership with exclusive tools, analytics, and an ad-free experience.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-r from-amber-400/5 via-[var(--ratist-red)]/5 to-transparent border border-amber-400/20 rounded-xl p-6 sm:p-8 mb-10">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          How It Works
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 mb-3">
              <span className="text-lg font-bold text-[var(--ratist-red)]">1</span>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Create an Account</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Sign up for a free Ratist account if you haven&apos;t already.</p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 mb-3">
              <span className="text-lg font-bold text-[var(--ratist-red)]">2</span>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Write 10 Ratist Reviews</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Rate movies and shows using the full Ratist rating rubric.</p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/30 mb-3">
              <Ticket className="w-5 h-5 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Get 6 Months Free</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Your Backstage Pass activates automatically. No credit card needed.</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center mb-12">
        {hasPass ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
            <p className="text-lg font-semibold text-emerald-400 mb-2">You already have the Backstage Pass!</p>
            <p className="text-sm text-[var(--foreground-muted)]">Enjoy all premium features.</p>
          </div>
        ) : user ? (
          <Link
            href="/movies"
            className="inline-flex items-center gap-2 px-8 py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-lg font-bold rounded-xl transition-colors"
          >
            Start Reviewing <ArrowRight className="w-5 h-5" />
          </Link>
        ) : (
          <SignInLink className="inline-flex items-center gap-2 px-8 py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-lg font-bold rounded-xl transition-colors">
            Sign Up & Start Reviewing <ArrowRight className="w-5 h-5" />
          </SignInLink>
        )}
      </div>

      {/* Qualifying details */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 sm:p-8 mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Qualifying Details</h2>
        <ul className="space-y-3">
          {QUALIFYING_RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-[var(--foreground-muted)]">
              <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* What's included */}
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <Ticket className="w-5 h-5 text-amber-400" /> What&apos;s Included in the Backstage Pass
      </h2>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mb-10">
        <div className="grid grid-cols-[1fr_80px_80px] border-b border-[var(--border)] px-5 py-3">
          <span className="text-sm font-semibold text-white">Feature</span>
          <span className="text-sm font-semibold text-[var(--foreground-muted)] text-center">Free</span>
          <span className="text-sm font-semibold text-amber-400 text-center">Backstage</span>
        </div>
        {FEATURES.map((f, i) => {
          const row = (
            <div key={i} className={`grid grid-cols-[1fr_80px_80px] px-5 py-3 ${i % 2 === 0 ? "bg-[var(--surface-2)]/30" : ""} ${"href" in f && f.href ? "hover:bg-[var(--surface-2)] cursor-pointer" : ""}`}>
              <span className={`text-sm text-white ${"href" in f && f.href ? "hover:text-amber-400 transition-colors" : ""}`}>
                {f.name} {"href" in f && f.href && <span className="text-[10px] text-[var(--foreground-muted)]">→</span>}
              </span>
              <div className="flex justify-center">
                {f.free ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-[var(--foreground-muted)] opacity-30" />}
              </div>
              <div className="flex justify-center">
                <Check className="w-4 h-4 text-amber-400" />
              </div>
            </div>
          );
          return "href" in f && f.href ? <Link key={i} href={f.href}>{row}</Link> : row;
        })}
      </div>

      {/* Fine print */}
      <div className="text-center">
        <p className="text-xs text-[var(--foreground-muted)]">
          After the 6-month promotional period, you can continue with a free account or subscribe to the Backstage Pass starting at $3.99/month.
        </p>
        <Link href="/backstage-pass" className="text-xs text-[var(--ratist-red)] hover:underline mt-2 inline-block">
          Learn more about the Backstage Pass &rarr;
        </Link>
      </div>
    </div>
  );
}
