"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, type LucideIcon } from "lucide-react";

interface Props {
  /** Unique key per surface — controls the localStorage flag.
   *  Stored under `ratist:hint:{storageKey}`. */
  storageKey: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  /** Optional CTA — usually a deep link into the action that fills
   *  the empty state (e.g. "/movies" from an empty diary). */
  cta?: { label: string; href: string };
}

/**
 * Just-in-time hint shown the first time a user lands on a feature
 * surface — used as a complement to the /welcome tour. Each instance
 * dismisses independently and stays dismissed forever.
 *
 * Render only when the surface is genuinely empty/first-visit; the
 * component itself only handles dismissal, not the gating.
 */
export default function FirstVisitHint({ storageKey, icon: Icon, title, children, cta }: Props) {
  // null until the storage check runs — avoids a flash on returning
  // users who already dismissed the hint.
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(`ratist:hint:${storageKey}`);
      setVisible(!dismissed);
    } catch {
      setVisible(true);
    }
  }, [storageKey]);

  function dismiss() {
    try {
      window.localStorage.setItem(`ratist:hint:${storageKey}`, String(Date.now()));
    } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="relative bg-[var(--surface-2)] border border-[var(--ratist-red)]/30 rounded-xl p-4 sm:p-5 mb-6">
      <button
        onClick={dismiss}
        aria-label="Dismiss hint"
        className="absolute top-2.5 right-2.5 p-1 text-[var(--foreground-muted)] hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="w-9 h-9 rounded-full bg-[var(--ratist-red)]/15 border border-[var(--ratist-red)]/30 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-[var(--ratist-red)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white mb-1">{title}</p>
          <div className="text-sm text-[var(--foreground-muted)] leading-relaxed">{children}</div>
          {cta && (
            <Link
              href={cta.href}
              className="inline-block mt-3 text-xs font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] px-3 py-1.5 rounded-lg transition-colors"
            >
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
