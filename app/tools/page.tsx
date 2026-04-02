import type { Metadata } from "next";
import Link from "next/link";
import { Wrench, Users, Film, Map, Trophy, Swords, BarChart3, Sparkles, MonitorPlay } from "lucide-react";

export const metadata: Metadata = { title: "Cinephile Tools" };

const TOOLS = [
  {
    href: "/tools/shared-cast",
    icon: Users,
    title: "Shared Cast & Crew",
    desc: "Select 2–4 movies to find actors and directors they share, or select 2–6 people to find movies they share. Filter by minimum overlap.",
  },
  {
    href: "/tools/actor-lookup",
    icon: Film,
    title: "What Else Do I Know Them From?",
    desc: "Search an actor or director and see only the movies and shows you've personally seen or rated.",
  },
  {
    href: "/movie-maps",
    icon: Map,
    title: "Movie Maps",
    desc: "Visual plot maps for complex, hard-to-follow films. Perfect for Nolan, Lynch, Kaufman, and other mind-bending directors.",
  },
  {
    href: "/tools/oscar-predictor",
    icon: Trophy,
    title: "Oscar Best Picture Predictor",
    desc: "Updated throughout the year. Uses Ratist metrics + historical winner data to score each contender's likelihood of winning Best Picture.",
  },
  {
    href: "/tools/matchup",
    icon: Swords,
    title: "The Matchup",
    desc: "Pick two movies and compare them head-to-head across every Ratist rating category. Let the data settle the debate.",
  },
  {
    href: "/tools/analytics",
    icon: BarChart3,
    title: "My Analytics",
    desc: "Deep insights into your movie habits. Genre breakdowns, director/actor affinities, rating trends, contrarian score, and custom reports.",
  },
  {
    href: "/tools/recommend",
    icon: Sparkles,
    title: "What Should I Watch?",
    desc: "Answer a few quick questions about your mood, preferred era, and runtime — and get personalized movie recommendations.",
  },
  {
    href: "/screening-room",
    icon: MonitorPlay,
    title: "Screening Room",
    desc: "Watch movies with friends remotely. Predict plots, react in real-time, run polls, and compare ratings when the credits roll.",
  },
];

export default function ToolsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Wrench className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Cinephile Tools</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-8">Powerful tools for the serious movie fan.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--ratist-red)] transition-colors group"
            >
              <Icon className="w-8 h-8 text-[var(--ratist-red)] mb-3" />
              <h2 className="text-base font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors mb-2">
                {tool.title}
              </h2>
              <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{tool.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
