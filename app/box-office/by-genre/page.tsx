import type { Metadata } from "next";
import Link from "next/link";
import { Layers, Info } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getTopGrossingByGenre } from "@/lib/box-office-queries";
import { Leaderboard } from "@/components/box-office/Leaderboard";

export const metadata: Metadata = {
  title: "Box Office by Genre",
  description:
    "Highest grossing films by genre: action, drama, comedy, horror, sci-fi, animation, and more.",
  alternates: { canonical: "/box-office/by-genre" },
  openGraph: {
    title: "Box Office by Genre",
    description: "Top grossing films within each major genre.",
    images: [{ url: "/api/og/box-office?page=branded&title=Box+Office+by+Genre&subtitle=Top+grossing+per+major+genre", width: 800, height: 520 }],
  },
};

export const revalidate = 21600;

// Curated genre order — chosen for "general interest" rather than
// alphabetical, so Action and Drama lead the page rather than
// Adventure or Documentary.
const FEATURED_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Drama",
  "Horror",
  "Science Fiction",
  "Thriller",
  "Romance",
  "Fantasy",
  "Mystery",
  "War",
];

export default async function BoxOfficeByGenrePage() {
  // Pull the matching Genre rows and the leaderboards in parallel.
  // We need the IDs from the Genre table because TMDB sync writes them
  // by name from the API, not from a hardcoded id list.
  const allGenres = await prisma.genre.findMany({
    where: { name: { in: FEATURED_GENRES } },
    select: { id: true, name: true },
  });
  // Re-order to match FEATURED_GENRES rather than DB insertion order.
  const ordered = FEATURED_GENRES
    .map((name) => allGenres.find((g) => g.name === name))
    .filter((g): g is { id: number; name: string } => g != null);

  const results = await Promise.all(ordered.map((g) => getTopGrossingByGenre(g.id, 10)));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Layers className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Box Office by Genre</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          Highest-grossing films within each major genre.
          {" "}
          <Link href="/box-office" className="text-[var(--ratist-red)] hover:underline">
            ← Back to leaderboards
          </Link>
        </p>
      </div>

      <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          Films often carry multiple genre tags from TMDB — an action-comedy may
          appear on both lists. Numbers are unadjusted lifetime grosses.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {ordered.map((g, idx) => (
          <Leaderboard
            key={g.id}
            icon={Layers}
            title={g.name}
            subtitle="Top grossing in genre"
            rows={results[idx]}
            metric="revenue"
            viewAllHref={`/box-office/all?genres=${g.id}&sort=revenue-desc`}
            share={{
              path: `/box-office/all?genres=${g.id}&sort=revenue-desc`,
              ogPath: `/api/og/box-office?page=genre&id=${g.id}&name=${encodeURIComponent(g.name)}`,
              shareText: `Top Grossing ${g.name} Films — The Ratist`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
