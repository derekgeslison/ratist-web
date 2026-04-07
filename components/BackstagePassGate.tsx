"use client";

import Link from "next/link";
import { Ticket, Lock } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

interface Props {
  children: React.ReactNode;
  /** Feature name shown in the lock message */
  feature?: string;
  /** Show a preview/teaser instead of completely hiding */
  showTeaser?: boolean;
  /** Custom message */
  message?: string;
}

/**
 * Wraps content that requires a Backstage Pass subscription.
 * Shows a lock screen with upgrade prompt for free users.
 */
export default function BackstagePassGate({ children, feature, showTeaser, message }: Props) {
  const { hasPass, loading } = useSubscription();

  if (loading) return <div className="py-12 text-center text-[var(--foreground-muted)]">Loading...</div>;

  if (hasPass) return <>{children}</>;

  return (
    <div className="relative">
      {showTeaser && <div className="opacity-20 pointer-events-none blur-sm">{children}</div>}
      <div className={`${showTeaser ? "absolute inset-0" : ""} flex flex-col items-center justify-center py-16 px-4`}>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 max-w-md text-center shadow-2xl">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 mb-4">
            <Lock className="w-6 h-6 text-[var(--ratist-red)]" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Backstage Pass Required</h2>
          <p className="text-sm text-[var(--foreground-muted)] mb-6">
            {message ?? `${feature ?? "This feature"} is available exclusively for Backstage Pass members.`}
          </p>
          <Link
            href="/backstage-pass"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold rounded-xl transition-colors"
          >
            <Ticket className="w-4 h-4" />
            Get the Backstage Pass
          </Link>
          <p className="text-xs text-[var(--foreground-muted)] mt-3">Starting at $3.99/month</p>
        </div>
      </div>
    </div>
  );
}
