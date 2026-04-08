"use client";

import { BarChart3 } from "lucide-react";
import FeatureShowcase from "@/components/FeatureShowcase";

export default function AnalyticsFeaturePage() {
  return (
    <FeatureShowcase
      title="My Analytics"
      subtitle="Deep insights into your viewing habits, taste patterns, and how you compare to the community."
      icon={BarChart3}
      highlights={[
        { title: "Viewing stats overview", description: "Total movies rated, total hours watched, average rating, average movie age — all at a glance." },
        { title: "Genre breakdown", description: "See which genres you watch most, which you rate highest, and discover your genre blind spots." },
        { title: "Decade analysis", description: "Explore your viewing patterns across decades. Are you a classics fan or a modern movie lover?" },
        { title: "Rating velocity", description: "Track how many movies you're watching per month. See your most active periods." },
        { title: "Director & actor affinities", description: "Discover which directors and actors consistently appear in your highest-rated films." },
        { title: "Contrarian score", description: "Find out how often your ratings diverge from the community average. Are you a crowd-pleaser or a contrarian?" },
      ]}
    >
      <div className="mb-10 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
        <p className="text-sm text-[var(--foreground-muted)]">
          <strong className="text-white">Pro tip:</strong> The more movies you rate with the full Ratist rubric (not just quick ratings), the more detailed and accurate your analytics become. Start rating to unlock deeper insights!
        </p>
      </div>
    </FeatureShowcase>
  );
}
