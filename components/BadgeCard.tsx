"use client";

import { useEffect, useRef, useState } from "react";
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

  // Tap-to-explain popover for the compact pill (mobile) — addresses
  // users mistaking the static circles for buttons. The popover
  // dismisses on outside tap or scroll. Hover-tooltip on desktop is
  // preserved via the title attribute.
  const [popOpen, setPopOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!popOpen) return;
    const close = (e: Event) => {
      if (wrapRef.current && e.target instanceof Node && wrapRef.current.contains(e.target)) return;
      setPopOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", () => setPopOpen(false), { passive: true, once: true });
    return () => document.removeEventListener("pointerdown", close, true);
  }, [popOpen]);

  if (compact) {
    const earnedLabel = earnedAt
      ? `Earned ${new Date(earnedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : null;
    return (
      <div ref={wrapRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPopOpen((v) => !v)}
          aria-expanded={popOpen}
          aria-label={name}
          title={`${name}${earnedAt ? ` — earned ${new Date(earnedAt).toLocaleDateString()}` : ""}`}
          className="flex items-center justify-center w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--ratist-red)] transition-colors"
        >
          <IconComponent className="w-4 h-4 text-[var(--foreground)]" />
        </button>
        {popOpen && (
          <div
            className="absolute z-30 top-full left-1/2 -translate-x-1/2 mt-2 w-56 max-w-[80vw] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-3"
            role="dialog"
          >
            <p className="text-sm font-semibold text-white">{name}</p>
            {description && (
              <p className="text-xs text-[var(--foreground-muted)] mt-1 leading-snug">{description}</p>
            )}
            {earnedLabel && (
              <p className="text-[10px] text-[var(--foreground-muted)] mt-2">{earnedLabel}</p>
            )}
          </div>
        )}
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
