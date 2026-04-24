import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MonitorPlay } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getMovieDetails, posterUrl } from "@/lib/tmdb";
import WatchCompanionView, { type WatchCompanionData } from "@/components/watch-companion/WatchCompanionView";
import ShareButton from "@/components/ShareButton";
import CompanionNotAvailable from "@/components/watch-companion/CompanionNotAvailable";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.theratist.com";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const tmdbId = Number(id);
  try {
    const movie = await getMovieDetails(tmdbId);
    // Look up the companion id so we can wire the OG image. If there's no
    // companion yet the og route just returns 404 and the social card
    // falls back to the site default.
    const companion = await prisma.watchCompanion.findUnique({
      where: { tmdbId_mediaType: { tmdbId, mediaType: "movie" } },
      select: { id: true },
    });
    const ogUrl = companion ? `${SITE_URL}/api/og/watch-companion?id=${companion.id}` : undefined;
    return {
      title: `${movie.title} — Watch Companion`,
      description: `Spoiler-safe reference guide for ${movie.title}: characters, relationships, and plot points as you watch.`,
      alternates: { canonical: `/movies/${id}/companion` },
      openGraph: ogUrl ? { images: [{ url: ogUrl, width: 1200, height: 630 }] } : undefined,
      twitter: ogUrl ? { card: "summary_large_image", images: [ogUrl] } : undefined,
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
      glossary: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!companion || companion.status !== "published") {
    // Fall back to the interactive generate/request UX. If there's a draft
    // sitting there, treat it like "not generated" for public viewers —
    // draft contents are admin-only.
    let movieTitle = "this movie";
    try { movieTitle = (await getMovieDetails(tmdbId)).title; } catch { /* best-effort */ }
    return <CompanionNotAvailable tmdbId={tmdbId} mediaType="movie" title={movieTitle} />;
  }

  // Resolve character image URLs from TMDB person profile paths
  const actorIds = companion.characters.map((c) => c.actorTmdbId).filter((v): v is number => typeof v === "number");
  const imageMap = await getActorImageMap(actorIds);
  const characters = companion.characters.map((c) => ({
    ...c,
    imageUrl: c.actorTmdbId ? imageMap.get(c.actorTmdbId) ?? null : null,
    seasonNumber: c.seasonNumber,
    visibleAfter: c.visibleAfter as WatchCompanionData["characters"][number]["visibleAfter"],
    facts: c.facts.map((f) => ({ ...f, visibleAfter: f.visibleAfter as WatchCompanionData["characters"][number]["facts"][number]["visibleAfter"] })),
  }));

  const data: WatchCompanionData = {
    id: companion.id,
    tmdbId: companion.tmdbId,
    title: companion.title,
    mediaType: "movie",
    runtimeSeconds: companion.runtimeSeconds,
    seasonsGenerated: companion.seasonsGenerated,
    characters,
    relationships: companion.relationships.map((r) => ({ ...r, seasonNumber: r.seasonNumber, visibleAfter: r.visibleAfter as WatchCompanionData["relationships"][number]["visibleAfter"] })),
    timeline: companion.timeline.map((t) => ({ ...t, seasonNumber: t.seasonNumber, visibleAfter: t.visibleAfter as WatchCompanionData["timeline"][number]["visibleAfter"] })),
    glossary: companion.glossary.map((g) => ({ ...g, seasonNumber: g.seasonNumber, visibleAfter: g.visibleAfter as WatchCompanionData["glossary"][number]["visibleAfter"] })),
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
          <ShareButton
            text={`Watch Companion for ${companion.title} — a spoiler-safe viewing guide on The Ratist.`}
            url={`${SITE_URL}/movies/${id}/companion`}
            label="Share"
            cardImageUrl={`${SITE_URL}/api/og/watch-companion?id=${companion.id}`}
          />
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

