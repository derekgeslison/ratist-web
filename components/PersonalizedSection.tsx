"use client";

import Link from "next/link";
import { List, Bookmark } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function PersonalizedSection() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg mb-1">Your personal movie universe</h2>
          <p className="text-[var(--foreground-muted)] text-sm max-w-xl">
            Track what you&apos;ve seen, rate movies your way, and get recommendations built for your taste.
          </p>
        </div>
        <Link
          href="/auth/signin"
          className="shrink-0 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold text-sm px-5 py-2.5 rounded-full transition-colors"
        >
          Get Started
        </Link>
      </div>
    );
  }

  const displayName = user.displayName ?? user.email?.split("@")[0] ?? "there";

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-xl p-5 transition-colors">
        <p className="text-[var(--foreground-muted)] text-xs uppercase tracking-widest mb-1">
          Welcome back, {displayName}
        </p>
        <Link
          href="/tools/rankings"
          className="flex items-center gap-3 group"
        >
          <List className="w-5 h-5 text-[var(--ratist-red)] shrink-0" />
          <div>
            <p className="text-white font-semibold group-hover:text-[var(--ratist-red)] transition-colors">
              My Rankings
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">
              Your definitive ranked list of everything you&apos;ve seen
            </p>
          </div>
        </Link>
      </div>
      <div className="flex-1 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-xl p-5 transition-colors">
        <p className="text-[var(--foreground-muted)] text-xs uppercase tracking-widest mb-1">
          Up next
        </p>
        <Link
          href="/watchlist"
          className="flex items-center gap-3 group"
        >
          <Bookmark className="w-5 h-5 text-[var(--ratist-red)] shrink-0" />
          <div>
            <p className="text-white font-semibold group-hover:text-[var(--ratist-red)] transition-colors">
              My Watchlist
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">
              Movies you want to watch, all in one place
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
