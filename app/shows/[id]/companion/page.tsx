import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MonitorPlay } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getShowDetails, posterUrl } from "@/lib/tmdb";
import WatchCompanionView, { type WatchCompanionData } from "@/components/watch-companion/WatchCompanionView";
import ShareButton from "@/components/ShareButton";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.theratist.com";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const tmdbId = Number(id);
  try {
    const show = await getShowDetails(tmdbId);
    const companion = await prisma.watchCompanion.findUnique({
      where: { tmdbId_mediaType: { tmdbId, mediaType: "tv" } },
      select: { id: true },
    });
    const ogUrl = companion ? `${SITE_URL}/api/og/watch-companion?id=${companion.id}` : undefined;
    return {
      title: `${show.name} — Watch Companion`,
      description: `Spoiler-safe reference guide for ${show.name}: characters, relationships, and plot points as you watch.`,
      alternates: { canonical: `/shows/${id}/companion` },
      openGraph: ogUrl ? { images: [{ url: ogUrl, width: 1200, height: 630 }] } : undefined,
      twitter: ogUrl ? { card: "summary_large_image", images: [ogUrl] } : undefined,
    };
  } catch {
    return { title: "Watch Companion" };
  }
}

export default async function ShowCompanionPage({ params }: Props) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId) || tmdbId < 1) notFound();

  const companion = await prisma.watchCompanion.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType: "tv" } },
    include: {
      characters: { include: { facts: true }, orderBy: { sortOrder: "asc" } },
      relationships: true,
      timeline: true,
      glossary: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!companion || companion.status !== "published") {
    return <CompanionNotAvailable tmdbId={tmdbId} />;
  }

  // Episode counts per season for the dropdown + the show's typical per-
  // episode runtime so the intra-episode slider's max matches actual length
  // instead of a blanket 60min default.
  const seasonEpisodeCounts: Record<number, number> = {};
  let defaultEpisodeRuntimeSeconds = 3600;
  try {
    const show = await getShowDetails(tmdbId);
    for (const s of show.seasons ?? []) {
      if (s.season_number > 0) {
        seasonEpisodeCounts[s.season_number] = s.episode_count ?? 0;
      }
    }
    if (Array.isArray(show.episode_run_time) && show.episode_run_time.length > 0) {
      // Use the first reported runtime (most common) * 60s.
      defaultEpisodeRuntimeSeconds = show.episode_run_time[0] * 60;
    }
  } catch { /* fall through — component has a sensible default */ }

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
    title: companion.title,
    mediaType: "tv",
    runtimeSeconds: null,
    seasonsGenerated: companion.seasonsGenerated,
    characters,
    relationships: companion.relationships.map((r) => ({ ...r, seasonNumber: r.seasonNumber, visibleAfter: r.visibleAfter as WatchCompanionData["relationships"][number]["visibleAfter"] })),
    timeline: companion.timeline.map((t) => ({ ...t, seasonNumber: t.seasonNumber, visibleAfter: t.visibleAfter as WatchCompanionData["timeline"][number]["visibleAfter"] })),
    glossary: companion.glossary.map((g) => ({ ...g, seasonNumber: g.seasonNumber, visibleAfter: g.visibleAfter as WatchCompanionData["glossary"][number]["visibleAfter"] })),
    seasonEpisodeCounts,
    defaultEpisodeRuntimeSeconds,
  };

  return (
    <div>
      <header className="bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link href={`/shows/${id}`} className="text-[var(--foreground-muted)] hover:text-white transition-colors" aria-label="Back to show page">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <MonitorPlay className="w-4 h-4 text-[var(--ratist-red)]" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider">Watch Companion</p>
            <p className="text-sm font-semibold text-white truncate">
              {companion.title}
              {companion.seasonsGenerated.length > 0 && <span className="text-[var(--foreground-muted)] font-normal"> · S{companion.seasonsGenerated.join(", S")}</span>}
            </p>
          </div>
          <ShareButton
            text={`Watch Companion for ${companion.title} — a spoiler-safe viewing guide on The Ratist.`}
            url={`${SITE_URL}/shows/${id}/companion`}
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

function CompanionNotAvailable({ tmdbId }: { tmdbId: number }) {
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
      <MonitorPlay className="w-10 h-10 text-[var(--foreground-muted)] mx-auto mb-4" />
      <h1 className="text-xl font-bold text-white mb-2">Watch Companion not available yet</h1>
      <p className="text-sm text-[var(--foreground-muted)] mb-6 leading-relaxed">
        No one has generated a spoiler-safe viewing guide for this show yet. Check back later, or head to the show page for ratings and reviews.
      </p>
      <Link
        href={`/shows/${tmdbId}`}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--ratist-red)] text-white rounded-full text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to show page
      </Link>
    </div>
  );
}
