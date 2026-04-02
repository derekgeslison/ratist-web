"use client";

import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

interface Props {
  tmdbId: number | null;
}

interface MovieDetails {
  title: string;
  budget?: number;
  revenue?: number;
  runtime?: number;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  tagline?: string;
  overview?: string;
  production_companies?: { name: string }[];
}

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

export default function ScreeningTrivia({ tmdbId }: Props) {
  const [facts, setFacts] = useState<string[]>([]);

  useEffect(() => {
    if (!tmdbId) return;
    (async () => {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`);
        if (!res.ok) return;
        const data: MovieDetails = await res.json();
        const trivia: string[] = [];

        if (data.tagline) trivia.push(`"${data.tagline}"`);
        if (data.budget && data.budget > 0) trivia.push(`Budget: ${formatMoney(data.budget)}`);
        if (data.revenue && data.revenue > 0) trivia.push(`Box office: ${formatMoney(data.revenue)}`);
        if (data.budget && data.revenue && data.budget > 0) {
          const roi = ((data.revenue - data.budget) / data.budget * 100).toFixed(0);
          if (Number(roi) > 0) trivia.push(`Return on investment: ${roi}%`);
        }
        if (data.runtime) {
          const h = Math.floor(data.runtime / 60);
          const m = data.runtime % 60;
          trivia.push(`Runtime: ${h > 0 ? `${h}h ${m}m` : `${m} minutes`}`);
        }
        if (data.vote_average && data.vote_count) {
          trivia.push(`TMDB rating: ${data.vote_average.toFixed(1)}/10 (${data.vote_count.toLocaleString()} votes)`);
        }
        if (data.release_date) {
          const year = new Date(data.release_date).getFullYear();
          const age = new Date().getFullYear() - year;
          if (age > 0) trivia.push(`Released ${age} year${age !== 1 ? "s" : ""} ago (${year})`);
        }
        if (data.production_companies && data.production_companies.length > 0) {
          trivia.push(`Produced by ${data.production_companies.slice(0, 2).map((c) => c.name).join(" & ")}`);
        }

        // Shuffle and take 3
        const shuffled = trivia.sort(() => Math.random() - 0.5).slice(0, 3);
        setFacts(shuffled);
      } catch { /* ignore */ }
    })();
  }, [tmdbId]);

  if (facts.length === 0) return null;

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[var(--ratist-red)]" /> Did You Know?
      </h2>
      <div className="space-y-2">
        {facts.map((fact, i) => (
          <p key={i} className="text-xs text-[var(--foreground-muted)]">• {fact}</p>
        ))}
      </div>
    </section>
  );
}
