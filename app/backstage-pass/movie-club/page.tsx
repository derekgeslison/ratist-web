"use client";

import { Clapperboard } from "lucide-react";
import FeatureShowcase from "@/components/FeatureShowcase";

export default function MovieClubFeaturePage() {
  return (
    <FeatureShowcase
      title="Movie Club"
      subtitle="A new movie every week. Watch it, rate it, discuss it with the community. The ultimate social movie experience."
      icon={Clapperboard}
      highlights={[
        { title: "Weekly movie picks", description: "Each week, a new movie is selected — sometimes by admins, sometimes randomly, sometimes by community vote." },
        { title: "Community voting", description: "During community vote weeks, nominate your picks and vote on what everyone watches next. Top pick wins." },
        { title: "Rate & review together", description: "Submit your review during the watching phase. Use the full Ratist rubric or a quick rating — your choice." },
        { title: "Discussion room", description: "After Friday at 8pm ET, the discussion opens. See everyone's ratings, superlatives, structured prompts, and more." },
        { title: "Superlatives & stats", description: "First Reviewer, Highest Rater, Contrarian, Speed Watcher — see who stands out each week." },
        { title: "Rewatch poll & trivia", description: "Vote on whether you'd rewatch the movie. Discover fun trivia about the film's budget, box office, and production." },
      ]}
    >
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-3">How the week works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { day: "Monday", desc: "The movie is revealed (or voting begins for community vote weeks)." },
            { day: "Mon – Fri", desc: "Watch the movie and submit your review at your own pace." },
            { day: "Friday 8pm ET", desc: "Discussion room opens. See all ratings, superlatives, and join the conversation." },
            { day: "Sunday", desc: "Week wraps up. Next week's movie is teased in the Coming Up section." },
          ].map((s) => (
            <div key={s.day} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-400">{s.day}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </FeatureShowcase>
  );
}
