import Link from "next/link";
import { Wrench, Users, Film, Map, Trophy, Swords, Star } from "lucide-react";

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
    href: "/tools/movie-maps",
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
    href: "/tools/punch-and-judy",
    icon: Swords,
    title: "Punch & Judy",
    desc: "The structured debate format for controversial movies. See the best arguments for and against, then cast your vote.",
  },
  {
    href: "/tools/rankings",
    icon: Star,
    title: "Personal Rankings",
    desc: "Rank your watched movies by year, all time, or a custom timeframe. Drag and drop to arrange your personal top lists.",
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
