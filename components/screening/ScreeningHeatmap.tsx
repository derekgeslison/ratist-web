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

  // Count messages per minute
  const buckets = new Array(durationMin).fill(0);
  for (const msg of chatMessages) {
    const elapsed = msg.timestamp - sessionStart;
    const minute = Math.min(Math.floor(elapsed / 60000), durationMin - 1);
    if (minute >= 0) buckets[minute]++;
  }

  const maxCount = Math.max(...buckets, 1);
  const barHeight = 60;

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
        <Activity className="w-4 h-4 text-[var(--ratist-red)]" /> Reaction Timeline
      </h2>
      <p className="text-xs text-[var(--foreground-muted)] mb-3">Chat activity over the course of the movie.</p>
      <div className="flex items-end gap-px" style={{ height: barHeight + 20 }}>
        {buckets.map((count, i) => {
          const h = Math.round((count / maxCount) * barHeight);
          const intensity = count / maxCount;
          const color = intensity > 0.7 ? "var(--ratist-red)" : intensity > 0.3 ? "#eab308" : "#374151";
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${i}:00 — ${count} messages`}>
              {count > 0 && (
                <div className="w-full rounded-t" style={{ height: Math.max(h, 2), backgroundColor: color, opacity: count > 0 ? 1 : 0.2 }} />
              )}
              {i % Math.max(1, Math.floor(durationMin / 8)) === 0 && (
                <span className="text-[8px] text-[var(--foreground-muted)] mt-1">{i}m</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
