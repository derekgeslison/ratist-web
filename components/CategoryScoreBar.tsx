import { scoreColor } from "@/lib/ratings";

interface Props {
  label: string;
  score: number | null;
}

export default function CategoryScoreBar({ label, score }: Props) {
  const pct = score != null ? (score / 10) * 100 : 0;
  const color = score != null ? scoreColor(score) : "var(--border)";

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-[var(--foreground-muted)] w-40 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-sm font-semibold w-8 text-right" style={{ color: score != null ? color : "var(--foreground-muted)" }}>
        {score != null ? score.toFixed(1) : "—"}
      </span>
    </div>
  );
}
