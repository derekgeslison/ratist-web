"use client";

import Link from "next/link";
import { Gift, Ticket } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

export default function BackstagePassPromo() {
  const { hasPass, loading } = useSubscription();

  if (loading || hasPass) return null;

  return (
    <section className="space-y-3">
      {/* First 1,000 promo — primary CTA */}
      <Link
        href="/promo/first-1000"
        className="flex items-center gap-4 bg-gradient-to-r from-amber-400/10 via-[var(--ratist-red)]/5 to-transparent border border-amber-400/30 rounded-xl p-5 hover:border-amber-400 transition-colors group"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-amber-400/20 to-[var(--ratist-red)]/10 border border-amber-400/30 shrink-0">
          <Gift className="w-6 h-6 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">
            Write 10 Reviews, Get 6 Months Free
          </p>
          <p className="text-sm text-[var(--foreground-muted)] mt-0.5">
            Be one of the first 1,000 reviewers to unlock a free Backstage Pass — premium tools, analytics, and ad-free.
          </p>
        </div>
        <span className="text-sm text-amber-400 font-semibold shrink-0 hidden sm:block">
          Learn more &rarr;
        </span>
      </Link>
    </section>
  );
}
