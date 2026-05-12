import { Info } from "lucide-react";
import { PROFIT_FORMULA_BLURB, type BoxOfficeMetric } from "@/lib/box-office";

// Inline explanation of the "Estimated" Profit / ROI formula. Shown
// only when metric === "est" — the Gross view (raw revenue − budget,
// revenue / budget) is self-explanatory and doesn't need a footnote.

export default function ProfitFormulaNote({ metric, className }: { metric: BoxOfficeMetric; className?: string }) {
  if (metric !== "est") return null;
  return (
    <div
      className={`flex items-start gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[11px] leading-relaxed text-[var(--foreground-muted)] ${className ?? ""}`}
    >
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--ratist-red)]" />
      <p>{PROFIT_FORMULA_BLURB}</p>
    </div>
  );
}
