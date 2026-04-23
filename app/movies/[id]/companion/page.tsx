import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MonitorPlay } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getMovieDetails, posterUrl } from "@/lib/tmdb";
import WatchCompanionView, { type WatchCompanionData } from "@/components/watch-companion/WatchCompanionView";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const tmdbId = Number(id);
  try {
    const movie = await getMovieDetails(tmdbId);
    return {
      title: `${movie.title} — Watch Companion`,
      description: `Spoiler-safe reference guide for ${movie.title}: characters, relationships, and plot points as you watch.`,
      alternates: { canonical: `/movies/${id}/companion` },
    };
  } catch {
    return { title: "Watch Companion" };
  }
}

export default async function MovieCompanionPage({ params }: Props) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId) || tmdbId < 1) notFound();

  const companion = await prisma.watchCompanion.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType: "movie" } },
    include: {
      characters: { include: { facts: true }, orderBy: { sortOrder: "asc" } },
      relationships: true,
      timeline: true,
      glossary: true,
    },
  });

  if (!companion || companion.status !== "published") {
    return <CompanionNotAvailable tmdbId={tmdbId} mediaType="movie" />;
  }

  // Resolve character image URLs from TMDB person profile paths
  const actorIds = companion.characters.map((c) => c.actorTmdbId).filter((v): v is number => typeof v === "number");
  const imageMap = await getActorImageMap(actorIds);
  const characters = companion.characters.map((c) => ({
    ...c,
    imageUrl: c.actorTmdbId ? imageMap.get(c.actorTmdbId) ?? null : null,
    visibleAfter: c.visibleAfter as WatchCompanionData["characters"][number]["visibleAfter"],
    facts: c.facts.map((f) => ({ ...f, visibleAfter: f.visibleAfter as WatchCompanionData["characters"][number]["facts"][number]["visibleAfter"] })),
  }));

  const data: WatchCompanionData = {
    id: companion.id,
    title: companion.title,
    mediaType: "movie",
    runtimeSeconds: companion.runtimeSeconds,
    seasonsGenerated: companion.seasonsGenerated,
    characters,
    relationships: companion.relationships.map((r) => ({ ...r, visibleAfter: r.visibleAfter as WatchCompanionData["relationships"][number]["visibleAfter"] })),
    timeline: companion.timeline.map((t) => ({ ...t, visibleAfter: t.visibleAfter as WatchCompanionData["timeline"][number]["visibleAfter"] })),
    glossary: companion.glossary.map((g) => ({ ...g, visibleAfter: g.visibleAfter as WatchCompanionData["glossary"][number]["visibleAfter"] })),
  };

  return (
    <div>
      <header className="bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link href={`/movies/${id}`} className="text-[var(--foreground-muted)] hover:text-white transition-colors" aria-label="Back to movie page">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <MonitorPlay className="w-4 h-4 text-[var(--ratist-red)]" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider">Watch Companion</p>
            <p className="text-sm font-semibold text-white truncate">{companion.title}</p>
          </div>
        </div>
      </header>
      <WatchCompanionView data={data} />
    </div>
  );
}

async function getActorImageMap(actorIds: number[]): Promise<Map<number, string | null>> {
  if (actorIds.length === 0) return new Map();
  const celebs = await prisma.celebrity.findMany({
    where: { tmdbId: { in: actorIds } },
    select: { tmdbId: true, profilePath: true },
  });
  const map = new Map<number, string | null>();
  for (const c of celebs) {
    map.set(c.tmdbId, c.profilePath ? posterUrl(c.profilePath, "w185") : null);
  }
  return map;
}

function CompanionNotAvailable({ tmdbId, mediaType }: { tmdbId: number; mediaType: "movie" | "tv" }) {
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
      <MonitorPlay className="w-10 h-10 text-[var(--foreground-muted)] mx-auto mb-4" />
      <h1 className="text-xl font-bold text-white mb-2">Watch Companion not available yet</h1>
      <p className="text-sm text-[var(--foreground-muted)] mb-6 leading-relaxed">
        No one has generated a spoiler-safe viewing guide for this {mediaType === "movie" ? "film" : "show"} yet. Check back later, or head to the {mediaType === "movie" ? "movie" : "show"} page for ratings and reviews.
      </p>
      <Link
        href={mediaType === "movie" ? `/movies/${tmdbId}` : `/shows/${tmdbId}`}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--ratist-red)] text-white rounded-full text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {mediaType === "movie" ? "movie" : "show"} page
      </Link>
    </div>
  );
}
