"use client";

import { Palette } from "lucide-react";
import FeatureShowcase from "@/components/FeatureShowcase";

export default function CustomThemesFeaturePage() {
  return (
    <FeatureShowcase
      title="Custom Profile Themes"
      subtitle="Make your profile truly yours. Choose from pre-made themes or create a custom look with your own colors and images."
      icon={Palette}
      highlights={[
        { title: "Pre-made themes", description: "Choose from a curated collection of themes inspired by iconic movies, genres, and directors. One click to transform your profile." },
        { title: "Custom color schemes", description: "Pick your own accent colors, background tones, and text styles. Create a look that matches your personality." },
        { title: "Custom header images", description: "Upload a header image for your profile. All images are verified through Google's SafeSearch API for community safety." },
        { title: "Stand out in the community", description: "A themed profile makes you memorable. When people visit your profile, they'll see your unique style." },
        { title: "Switch anytime", description: "Change your theme whenever you want. Try different looks for different seasons, moods, or favorite movies." },
      ]}
    >
      <div className="mb-10 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center">
        <Palette className="w-8 h-8 text-amber-400 mx-auto mb-2" />
        <p className="text-sm text-[var(--foreground-muted)]">
          Custom themes are coming soon! Subscribe to the Backstage Pass now and you&apos;ll have access as soon as they launch.
        </p>
      </div>
    </FeatureShowcase>
  );
}
