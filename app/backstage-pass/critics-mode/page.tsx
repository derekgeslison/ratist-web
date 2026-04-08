"use client";

import { Star, Mic } from "lucide-react";
import FeatureShowcase from "@/components/FeatureShowcase";

export default function CriticsModeFeaturePage() {
  return (
    <FeatureShowcase
      title="Live Review & Critics Mode"
      subtitle="Take your reviews to the next level with real-time commentary and the prestigious Critics Mode."
      icon={Star}
      extraRequirement="Critics Mode also requires 250+ Ratist rubric reviews"
      highlights={[
        { title: "Live Review — record as you watch", description: "Capture your thoughts in real-time while watching a movie. Timestamp your reactions, note standout moments, and build a rich commentary track that makes your review more authentic and detailed." },
        { title: "Live Review in Standard & Critic modes", description: "Available in both the standard Ratist review and Critics Mode. Your live notes integrate directly into your final review." },
        { title: "Critics Mode — elevated reviews", description: "Add per-field commentary to every rating category. Explain why you gave cinematography a 9 or why the pacing felt off. Your reviews become mini-essays that the community can learn from." },
        { title: "Category summaries", description: "Write summary thoughts for each major category (Story, Style, Emotive, Acting, Entertainment) to give readers a structured breakdown." },
        { title: "Critics badge", description: "Reviews submitted in Critics Mode are marked with a special badge, distinguishing them from standard reviews." },
        { title: "Earn your way in", description: "Critics Mode requires both a Backstage Pass and 250+ movies reviewed with the Ratist rubric. This ensures Critics Mode is reserved for experienced, thoughtful reviewers." },
      ]}
    >
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-3">Two powerful tools, one subscription</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <Mic className="w-6 h-6 text-amber-400 mb-2" />
            <h3 className="text-sm font-semibold text-white mb-1">Live Review</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Available immediately with Backstage Pass. Record timestamped notes as you watch, then weave them into your final review.</p>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <Star className="w-6 h-6 text-amber-400 mb-2" />
            <h3 className="text-sm font-semibold text-white mb-1">Critics Mode</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Unlocks after 250 Ratist rubric reviews. Add per-field commentary, category summaries, and earn the Critics badge on your reviews.</p>
          </div>
        </div>
      </div>
    </FeatureShowcase>
  );
}
