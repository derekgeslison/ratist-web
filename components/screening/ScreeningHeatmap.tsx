"use client";

import { Activity } from "lucide-react";

interface Props {
  chatMessages: { timestamp: number }[];
  startedAt: string | null;
}

export default function ScreeningHeatmap({ chatMessages, startedAt }: Props) {
  if (!startedAt || chatMessages.length < 3) return null;

  const sessionStart = new Date(startedAt).getTime();
  const lastMsg = chatMessages[chatMessages.length - 1];
  const durationMs = lastMsg.timestamp - sessionStart;
  const durationMin = Math.ceil(durationMs / 60000);

  if (durationMin < 2) return null;

  // Bucket size: 3 minutes per bar. Per-minute buckets looked too
  // confetti-like at long durations and made it hard to see "where
  // the conversation peaked." 3-min slices keep the bar count
  // manageable (90-min movie → 30 bars, 3hr epic → 60), and they
  // group adjacent chatter into a single visual peak instead of
  // scattering it across many thin bars.
  const BUCKET_MINUTES = 3;
  const bucketCount = Math.max(1, Math.ceil(durationMin / BUCKET_MINUTES));

  const buckets = new Array(bucketCount).fill(0);
  for (const msg of chatMessages) {
    const elapsedMin = (msg.timestamp - sessionStart) / 60000;
    const idx = Math.min(bucketCount - 1, Math.floor(elapsedMin / BUCKET_MINUTES));
    if (idx >= 0) buckets[idx]++;
  }

  const maxCount = Math.max(...buckets, 1);
  const barHeight = 60;

  // Pick label indices to render in the separate axis row below.
  // Roughly 8 ticks across the duration — uses a step that keeps
  // spacing even across short and long sessions. Stored as a Set for
  // O(1) lookup when rendering label slots.
  const labelStep = Math.max(1, Math.floor(bucketCount / 8));
  const labelIndices = new Set<number>();
  for (let i = 0; i < bucketCount; i += labelStep) labelIndices.add(i);

  // HH:MM time formatter. Earlier version rendered raw "Nm" (e.g.,
  // 47m, 89m, 134m) which got progressively harder to parse on long
  // films. HH:MM matches the elapsed display in chat for visual
  // consistency. Each bucket index maps to (i × BUCKET_MINUTES) minutes
  // into the watch.
  const fmt = (bucketIdx: number) => {
    const mins = bucketIdx * BUCKET_MINUTES;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  };

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
        <Activity className="w-4 h-4 text-[var(--ratist-red)]" /> Reaction Timeline
      </h2>
      <p className="text-xs text-[var(--foreground-muted)] mb-3">Chat activity over the course of the movie.</p>

      {/* Bars row — every bucket gets a flex:1 cell so widths are equal.
         The old layout placed each label INSIDE the bar's flex item,
         which forced label-bearing buckets to grow wider than the
         label-less ones (a label like "47m" is wider than a single
         bar's pixel slot at high bucket counts). Splitting bars and
         labels into two parallel rows keeps the bar grid uniform. */}
      <div className="flex items-end gap-px" style={{ height: barHeight }}>
        {buckets.map((count, i) => {
          const h = Math.round((count / maxCount) * barHeight);
          const intensity = count / maxCount;
          const color = intensity > 0.7 ? "var(--ratist-red)" : intensity > 0.3 ? "#eab308" : "#374151";
          return (
            <div key={i} className="flex-1 flex items-end" title={`${fmt(i)} — ${count} messages`}>
              {count > 0 && (
                <div className="w-full rounded-t" style={{ height: Math.max(h, 2), backgroundColor: color }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Axis row — same flex:1 grid as the bars so labels line up
         under the bucket they refer to without distorting bar widths. */}
      <div className="flex gap-px mt-1.5">
        {buckets.map((_, i) => (
          <div key={i} className="flex-1 flex justify-center" aria-hidden={!labelIndices.has(i)}>
            {labelIndices.has(i) && (
              <span className="text-[9px] text-[var(--foreground-muted)]">{fmt(i)}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
