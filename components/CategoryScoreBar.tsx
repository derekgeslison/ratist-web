"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { scoreColor } from "@/lib/ratings";

interface SubField {
  key: string;
  label: string;
  score: number | null;
}

interface Props {
  label: string;
  score: number | null;
  /** Sub-field breakdown shown when the bar is expanded. Each entry
   *  carries the user's average score for that field across all
   *  their ratings. When omitted, the bar is non-interactive. */
  subFields?: SubField[];
}

export default function CategoryScoreBar({ label, score, subFields }: Props) {
  const [open, setOpen] = useState(false);
  const pct = score != null ? (score / 10) * 100 : 0;
  const color = score != null ? scoreColor(score) : "var(--border)";
  const expandable = !!subFields && subFields.length > 0;

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
        <div className="mt-2 mb-1 ml-2 sm:ml-6 space-y-1.5">
          {subFields!.map((sf) => {
            const val = sf.score;
            if (val == null) return null;
            const subColor = scoreColor(val);
            return (
              <div key={sf.key} className="flex items-center gap-3">
                <span className="text-xs text-[var(--foreground-muted)] w-32 sm:w-36 shrink-0 text-left">{sf.label}</span>
                <div className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(val / 10) * 100}%`, background: subColor }} />
                </div>
                <span className="text-xs font-semibold w-8 text-right" style={{ color: subColor }}>
                  {val.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
