"use client";

import { MonitorPlay } from "lucide-react";
import FeatureShowcase from "@/components/FeatureShowcase";

export default function ScreeningRoomFeaturePage() {
  return (
    <FeatureShowcase
      title="Screening Room"
      subtitle="Watch movies with friends remotely. Predict plots, react in real-time, run polls, and compare ratings when the credits roll."
      icon={MonitorPlay}
      highlights={[
        { title: "Host unlimited sessions", description: "Create a screening room and invite friends with a unique join code. Anyone can join for free — only hosting requires the Backstage Pass." },
        { title: "Real-time chat & reactions", description: "Chat with participants while you watch. Bookmark key moments and highlight the best conversations." },
        { title: "Polls & predictions", description: "Create custom polls during the movie. Have everyone predict the plot or guess the ending before it happens." },
        { title: "Post-watch ratings & comparison", description: "After the movie ends, everyone submits their rating using the full Ratist rubric. See how your scores compare side by side." },
        { title: "Shareable recap", description: "Get a beautifully formatted recap of the session — ratings, predictions, highlights — that you can share on social media." },
      ]}
    >
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-3">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { step: "1", label: "Create a room", desc: "Pick a movie, set up your room, and share the join code with friends." },
            { step: "2", label: "Watch together", desc: "Everyone watches on their own screen. Chat, react, and predict in real-time." },
            { step: "3", label: "Compare & discuss", desc: "Submit ratings and see how everyone scored the movie. Share the recap." },
          ].map((s) => (
            <div key={s.step} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <span className="text-2xl font-black text-amber-400">{s.step}</span>
              <p className="text-sm font-semibold text-white mt-1">{s.label}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </FeatureShowcase>
  );
}
