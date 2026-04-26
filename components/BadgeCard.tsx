"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  // users mistaking the static circles for buttons. The popover is
  // portaled to document.body because the trophy case's parent uses
  // overflow-x-auto for horizontal scrolling, which would clip an
  // absolutely-positioned popover rendered as a child. Position is
  // computed from the button's getBoundingClientRect at open time.
  const [popOpen, setPopOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  function openPop() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      // getBoundingClientRect returns viewport coords; with
      // position: fixed we want viewport coords directly (no scroll
      // offset). Popover dismisses on scroll, so it doesn't need to
      // track scroll position.
      setPopPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
    }
    setPopOpen(true);
  }

  useEffect(() => {
    if (!popOpen) return;
    const close = (e: Event) => {
      const target = e.target as Node | null;
      if (target && (buttonRef.current?.contains(target) || popRef.current?.contains(target))) return;
      setPopOpen(false);
    };
    const dismissOnScroll = () => setPopOpen(false);
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", dismissOnScroll, { passive: true, once: true });
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", dismissOnScroll);
    };
  }, [popOpen]);

  if (compact) {
    const earnedLabel = earnedAt
      ? `Earned ${new Date(earnedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : null;
    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => (popOpen ? setPopOpen(false) : openPop())}
          aria-expanded={popOpen}
          aria-label={name}
          title={`${name}${earnedAt ? ` — earned ${new Date(earnedAt).toLocaleDateString()}` : ""}`}
          className="flex items-center justify-center w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--ratist-red)] transition-colors shrink-0"
        >
          <IconComponent className="w-4 h-4 text-[var(--foreground)]" />
        </button>
        {mounted && popOpen && popPos && createPortal(
          <div
            ref={popRef}
            className="fixed z-[60] -translate-x-1/2 w-56 max-w-[80vw] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-3"
            style={{ top: popPos.top, left: popPos.left }}
            role="dialog"
          >
            <p className="text-sm font-semibold text-white">{name}</p>
            {description && (
              <p className="text-xs text-[var(--foreground-muted)] mt-1 leading-snug">{description}</p>
            )}
            {earnedLabel && (
              <p className="text-[10px] text-[var(--foreground-muted)] mt-2">{earnedLabel}</p>
            )}
          </div>,
          document.body
        )}
      </>
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
