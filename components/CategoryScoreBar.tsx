"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { scoreColor } from "@/lib/ratings";

interface Props {
  label: string;
  score: number | null;
  /** Optional sub-field labels that contribute to this category's
   *  score. When provided, the bar becomes tappable and reveals
   *  them. Used on profile preference cards so visitors can see
   *  what "Narrative" or "Cinematic" actually means. */
  contributors?: readonly string[];
}

export default function CategoryScoreBar({ label, score, contributors }: Props) {
  const [open, setOpen] = useState(false);
  const pct = score != null ? (score / 10) * 100 : 0;
  const color = score != null ? scoreColor(score) : "var(--border)";
  const expandable = !!contributors && contributors.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        disabled={!expandable}
        className={`flex items-center gap-3 w-full ${expandable ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className="text-sm text-[var(--foreground-muted)] w-40 shrink-0 text-left">{label}</span>
        <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
        <span className="text-sm font-semibold w-8 text-right" style={{ color: score != null ? color : "var(--foreground-muted)" }}>
          {score != null ? score.toFixed(1) : "—"}
        </span>
        {expandable && (
          open
            ? <ChevronDown className="w-3.5 h-3.5 text-[var(--foreground-muted)] shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-[var(--foreground-muted)] shrink-0" />
        )}
      </button>
      {open && expandable && (
        <p className="text-xs text-[var(--foreground-muted)] mt-1.5 ml-1 leading-relaxed">
          Calculated from: {contributors!.join(", ")}.
        </p>
      )}
    </div>
  );
}
