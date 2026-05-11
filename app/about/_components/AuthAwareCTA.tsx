"use client";

import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import SignInLink from "@/components/SignInLink";
import { useAuth } from "@/context/AuthContext";

// Two CTAs on /about that swap copy + destination based on auth state.
// Signed-out: "Get started — it's free" → sign-in flow.
// Signed-in: "Find movies to rate" → /movies (the most fundamental
// next action — recommendations only work once they've rated stuff).
// During the AuthContext load tick we render the signed-out version so
// SSR matches first paint for the common (anonymous) case.

export function HeroPrimaryCTA() {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return (
      <Link
        href="/movies"
        className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] px-5 py-2.5 rounded-full transition-colors"
      >
        <Star className="w-4 h-4" /> Find movies to rate
      </Link>
    );
  }

  return (
    <SignInLink className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] px-5 py-2.5 rounded-full transition-colors">
      Get started — it&apos;s free
      <ArrowRight className="w-4 h-4" />
    </SignInLink>
  );
}

export function FinalPrimaryCTA() {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return (
      <Link
        href="/movies"
        className="inline-flex items-center gap-2 text-white font-semibold bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] px-7 py-3 rounded-full transition-colors text-sm"
      >
        <Star className="w-4 h-4" /> Find movies to rate
      </Link>
    );
  }

  return (
    <SignInLink className="text-white font-semibold bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] px-7 py-3 rounded-full transition-colors text-sm">
      Get started
    </SignInLink>
  );
}
