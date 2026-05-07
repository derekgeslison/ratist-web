"use client";

import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { Ticket } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/context/AuthContext";

interface Props {
  /** The feature this CTA is unlocking — e.g. "Movie Club", "Screening Room". */
  featureName: string;
}

/**
 * The bottom-of-page CTA used across every /backstage-pass/[feature]
 * surface. Same brand block (amber border, ticket icon, $3.99/mo
 * anchor) regardless of which feature page the user is on; the only
 * difference is the feature name woven into the copy. Keeping this
 * shared means brand/price changes are one-file changes.
 */
export default function BackstagePassCTA({ featureName }: Props) {
  const { user } = useAuth();
  const { hasPass } = useSubscription();

  return (
    <div className="bg-[var(--surface)] border border-amber-400/30 rounded-2xl p-8 text-center">
      {hasPass ? (
        <>
          <p className="text-lg font-semibold text-amber-400 mb-2">You have the Backstage Pass!</p>
          <p className="text-sm text-[var(--foreground-muted)]">{featureName} is unlocked for you.</p>
        </>
      ) : (
        <>
          <Ticket className="w-8 h-8 text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Unlock with the Backstage Pass</h2>
          <p className="text-sm text-[var(--foreground-muted)] mb-6">
            Get access to {featureName} and every other premium feature.
          </p>
          {user ? (
            <Link
              href="/backstage-pass"
              className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors"
            >
              <Ticket className="w-4 h-4" /> Get the Backstage Pass — from $3.99/month
            </Link>
          ) : (
            <SignInLink className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors">
              Sign in to subscribe
            </SignInLink>
          )}
        </>
      )}
    </div>
  );
}
