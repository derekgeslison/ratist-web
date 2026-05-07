"use client";

import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { Ticket, Check, X, Gift, ArrowRight, Trophy } from "lucide-react";
import { BACKSTAGE_FEATURES as FEATURES } from "@/lib/backstage-features";

const QUALIFYING_RULES_6MO = [
  "You must be one of the first 1,000 users to complete the challenge.",
  "Write 10 full Ratist reviews using the Ratist rating rubric (not quick ratings or imports).",
  "Reviews must be for 10 different movies or TV shows.",
  "Your account must be in good standing (no bans or violations).",
  "The 6-month Backstage Pass will be automatically applied once you hit 10 qualifying reviews.",
  "This promotion can only be redeemed once per account.",
];

const QUALIFYING_RULES_LIFETIME = [
  "Write 100 full Ratist reviews using the Ratist rating rubric (not quick ratings or imports).",
  "Reviews must be for 100 different movies or TV shows.",
  "The raffle will be held once 1,000 users have each completed 10+ Ratist reviews and at least 10 users have completed 100+ reviews.",
  "10 winners will be randomly selected from all users with 100+ qualifying reviews.",
  "Winners receive a lifetime Backstage Pass — no subscription fee, ever.",
  "Lifetime access is contingent on maintaining your reviews and keeping your account in good standing. Deleting qualifying reviews may result in the removal of the lifetime pass.",
  "This raffle cannot be transferred and is limited to one entry per account.",
  "Your account must be in good standing (no bans or violations).",
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
          Early Reviewer <span className="text-amber-400">Rewards</span>
        </h1>
        <p className="text-lg text-[var(--foreground-muted)] max-w-2xl mx-auto">
          We&apos;re rewarding our earliest and most dedicated reviewers with free premium access. Two ways to earn the Backstage Pass — no credit card needed.
        </p>
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

      {/* ── Promo 1: 6 Months Free ── */}
      <div className="bg-gradient-to-r from-amber-400/5 via-[var(--ratist-red)]/5 to-transparent border border-amber-400/20 rounded-xl p-6 sm:p-8 mb-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center shrink-0">
            <Ticket className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">6 Months Free</h2>
            <p className="text-sm text-[var(--foreground-muted)]">First 1,000 users to write 10 Ratist reviews</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-6 mb-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 mb-2">
              <span className="text-base font-bold text-[var(--ratist-red)]">1</span>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Create an Account</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Sign up for free.</p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 mb-2">
              <span className="text-base font-bold text-[var(--ratist-red)]">2</span>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Write 10 Reviews</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Use the full Ratist rating rubric.</p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/30 mb-2">
              <Ticket className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Get 6 Months Free</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Backstage Pass activates automatically.</p>
          </div>
        </div>

        <details className="group">
          <summary className="text-sm text-[var(--ratist-red)] cursor-pointer hover:underline">Qualifying Details</summary>
          <ul className="mt-3 space-y-2">
            {QUALIFYING_RULES_6MO.map((rule, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--foreground-muted)]">
                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      {/* ── Promo 2: Lifetime Raffle ── */}
      <div className="bg-gradient-to-r from-purple-500/5 via-amber-400/5 to-transparent border border-purple-500/20 rounded-xl p-6 sm:p-8 mb-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Lifetime Backstage Pass Raffle</h2>
            <p className="text-sm text-[var(--foreground-muted)]">10 random users who write 100+ Ratist reviews win lifetime premium</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-6 mb-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/30 mb-2">
              <span className="text-base font-bold text-purple-400">1</span>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Write 100 Reviews</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Use the full Ratist rating rubric for 100 different titles.</p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/30 mb-2">
              <span className="text-base font-bold text-purple-400">2</span>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Community Milestone</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Raffle triggers when 1,000 users hit 10+ reviews and 10+ users hit 100+ reviews.</p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/30 mb-2">
              <Trophy className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">10 Winners</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Randomly selected — lifetime Backstage Pass, forever.</p>
          </div>
        </div>

        <details className="group">
          <summary className="text-sm text-purple-400 cursor-pointer hover:underline">Qualifying Details</summary>
          <ul className="mt-3 space-y-2">
            {QUALIFYING_RULES_LIFETIME.map((rule, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--foreground-muted)]">
                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </details>
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
            <div key={i} className={`grid grid-cols-[1fr_80px_80px] px-5 py-3 items-center ${i % 2 === 0 ? "bg-[var(--surface-2)]/30" : ""} ${f.href ? "hover:bg-[var(--surface-2)] cursor-pointer" : ""}`}>
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

      {/* Fine print */}
      <div className="text-center">
        <p className="text-xs text-[var(--foreground-muted)]">
          After the 6-month promotional period, you can continue with a free account or subscribe to the Backstage Pass starting at $3.99/month.
          Lifetime raffle winners retain access indefinitely, subject to terms.
        </p>
        <Link href="/backstage-pass" className="text-xs text-[var(--ratist-red)] hover:underline mt-2 inline-block">
          Learn more about the Backstage Pass &rarr;
        </Link>
      </div>
    </div>
  );
}
