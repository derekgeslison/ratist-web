"use client";

import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, Minus, ExternalLink } from "lucide-react";

/**
 * One HUD card — used in the grid below the Marquee visual.
 *
 * Three states:
 *   - "dim"     : page just loaded, no brief playing yet. Card visible
 *                 with numbers but subtle (low opacity, no border glow).
 *   - "highlight": Marquee is narrating THIS section. Pulse + red border
 *                  glow + scale-up. Drops back to "lit" when the segment
 *                  ends.
 *   - "lit"     : has been narrated this brief; numbers are sharp,
 *                 border faintly red.
 */

interface Props {
  title: string;
  /** Big number / lead value */
  value: string | number;
  /** Optional sub-line, e.g. "↑ 40% WoW" */
  sub?: string;
  /** "up" | "down" | "flat" — drives icon + color of sub line */
  trend?: "up" | "down" | "flat" | null;
  /** Deep-dive link to the relevant admin sub-page */
  href?: string;
  state: "dim" | "highlight" | "lit";
}

export default function HudCard({ title, value, sub, trend, href, state }: Props) {
  const stateClass =
    state === "highlight"
      ? "border-[var(--ratist-red)] shadow-[0_0_24px_rgba(204,16,52,0.45)] scale-[1.02]"
      : state === "lit"
        ? "border-[var(--ratist-red)]/40"
        : "border-[var(--border)]/40 opacity-60";

  const trendIcon =
    trend === "up" ? <ArrowUpRight className="w-3.5 h-3.5" /> :
    trend === "down" ? <ArrowDownRight className="w-3.5 h-3.5" /> :
    trend === "flat" ? <Minus className="w-3.5 h-3.5" /> : null;
  const trendColor =
    trend === "up" ? "text-emerald-400" :
    trend === "down" ? "text-amber-400" :
    "text-[var(--foreground-muted)]";

  const body = (
    <div
      className={`relative bg-[var(--surface)] border rounded-lg p-4 transition-all duration-500 ease-out ${stateClass}`}
    >
      {/* Corner ticks for the HUD vibe */}
      <span className="absolute top-0 left-0 w-2 h-2 border-l border-t border-[var(--ratist-red)]/60" />
      <span className="absolute top-0 right-0 w-2 h-2 border-r border-t border-[var(--ratist-red)]/60" />
      <span className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-[var(--ratist-red)]/60" />
      <span className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-[var(--ratist-red)]/60" />

      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">{title}</span>
        {href && <ExternalLink className="w-3 h-3 text-[var(--foreground-muted)]/60" />}
      </div>
      <p className="text-3xl font-bold text-white tabular-nums leading-none">{value}</p>
      {sub && (
        <p className={`text-xs mt-2 flex items-center gap-1 ${trendColor}`}>
          {trendIcon}
          <span>{sub}</span>
        </p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} target="_blank" rel="noopener noreferrer" className="block">
        {body}
      </Link>
    );
  }
  return body;
}
