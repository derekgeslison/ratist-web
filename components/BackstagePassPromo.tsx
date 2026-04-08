"use client";

import Link from "next/link";
import { Ticket } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

export default function BackstagePassPromo() {
  const { hasPass, loading } = useSubscription();

  if (loading || hasPass) return null;

  return (
    <section>
      <Link
        href="/backstage-pass"
        className="flex items-center gap-4 bg-gradient-to-r from-amber-400/10 via-amber-400/5 to-transparent border border-amber-400/30 rounded-xl p-5 hover:border-amber-400 transition-colors group"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/30 shrink-0">
          <Ticket className="w-6 h-6 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">
            Backstage Pass
          </p>
          <p className="text-sm text-[var(--foreground-muted)] mt-0.5">
            Host Screening Rooms, unlock Analytics, Collections, Movie Club, Critics Mode, and go ad-free.
          </p>
        </div>
        <span className="text-sm text-amber-400 font-semibold shrink-0 hidden sm:block">
          From $3.99/mo &rarr;
        </span>
      </Link>
    </section>
  );
}
