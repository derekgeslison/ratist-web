"use client";

import { Sparkles } from "lucide-react";
import FeatureShowcase from "@/components/FeatureShowcase";

export default function CollectionsFeaturePage() {
  return (
    <FeatureShowcase
      title="Collections"
      subtitle="Personalized movie recommendations powered by your taste profile. Discover hidden gems and fill your blind spots."
      icon={Sparkles}
      highlights={[
        { title: "Taste-based recommendations", description: "Collections are generated from your unique taste profile — built from every Ratist review you've submitted." },
        { title: "Director deep dives", description: "Love a director's style? Collections surfaces their lesser-known works you haven't seen yet." },
        { title: "Hidden gems", description: "Highly-rated movies that match your taste profile but flew under the radar. Your next favorite movie is waiting." },
        { title: "Fill your blind spots", description: "Classic films and must-watches in your preferred genres that you haven't seen yet." },
        { title: "Dynamic & personal", description: "Collections update as you rate more movies. The more you review, the better your recommendations become." },
      ]}
    >
      <div className="mb-10 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
        <p className="text-sm text-[var(--foreground-muted)]">
          <strong className="text-white">Getting the most out of Collections:</strong> Your recommendations are only as good as your taste profile. Rate at least 20 movies with the full Ratist rubric to start seeing personalized collections. The more you rate, the sharper your recommendations become.
        </p>
      </div>
    </FeatureShowcase>
  );
}
