"use client";

import { Lock, Award } from "lucide-react";
import * as LucideIcons from "lucide-react";

interface Props {
  slug: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  earnedAt?: string | null;
  compact?: boolean;
}

export default function BadgeCard({ name, description, icon, earned, earnedAt, compact }: Props) {
  // Dynamically resolve the lucide icon
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = ((LucideIcons as any)[icon] ?? Award) as React.ComponentType<{ className?: string }>;

  if (compact) {
    return (
      <div
        className="flex items-center justify-center w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface)] shrink-0"
        title={`${name}${earnedAt ? ` — earned ${new Date(earnedAt).toLocaleDateString()}` : ""}`}
      >
        <IconComponent className="w-4 h-4 text-[var(--foreground-muted)]" />
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col items-center text-center p-4 rounded-xl border transition-colors ${
        earned
          ? "border-[var(--ratist-red)]/30 bg-[var(--ratist-red)]/5"
          : "border-[var(--border)] bg-[var(--surface)] opacity-50"
      }`}
    >
      <div
        className={`flex items-center justify-center w-12 h-12 rounded-full mb-2 ${
          earned ? "bg-[var(--ratist-red)]/15" : "bg-[var(--surface-2)]"
        }`}
      >
        {earned ? (
          <IconComponent className="w-6 h-6 text-[var(--ratist-red)]" />
        ) : (
          <Lock className="w-5 h-5 text-[var(--foreground-muted)]" />
        )}
      </div>
      <h3 className={`text-sm font-semibold mb-1 ${earned ? "text-[var(--foreground)]" : "text-[var(--foreground-muted)]"}`}>
        {name}
      </h3>
      <p className="text-xs text-[var(--foreground-muted)] leading-snug">{description}</p>
      {earned && earnedAt && (
        <p className="text-[10px] text-[var(--foreground-muted)] mt-2">
          {new Date(earnedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      )}
    </div>
  );
}
