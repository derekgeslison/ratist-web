import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getMovieDetails, posterUrl } from "@/lib/tmdb";
import WatchCompanionView, { type WatchCompanionData } from "@/components/watch-companion/WatchCompanionView";
import ShareButton from "@/components/ShareButton";
import ShareNudge from "@/components/ShareNudge";
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
      characters: {
        include: {
          facts: true,
          actors: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { sortOrder: "asc" },
      },
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

  // Resolve character image URLs from TMDB person profile paths. Collect
  // every actor id referenced by the primary char record OR any side-table
  // actor row so multi-actor characters get all their portraits.
  const actorIdSet = new Set<number>();
  for (const c of companion.characters) {
    if (typeof c.actorTmdbId === "number") actorIdSet.add(c.actorTmdbId);
    for (const a of c.actors) if (typeof a.actorTmdbId === "number") actorIdSet.add(a.actorTmdbId);
  }
  const imageMap = await getActorImageMap(Array.from(actorIdSet));
  type CharData = WatchCompanionData["characters"][number];
  const characters: CharData[] = companion.characters.map((c) => ({
    id: c.id,
    name: c.name,
    actorName: c.actorName,
    actorTmdbId: c.actorTmdbId,
    baseDescription: c.baseDescription,
    group: c.group,
    imageUrl: c.actorTmdbId ? imageMap.get(c.actorTmdbId) ?? null : null,
    seasonNumber: c.seasonNumber,
    visibleAfter: c.visibleAfter as CharData["visibleAfter"],
    facts: c.facts.map((f) => ({ ...f, visibleAfter: f.visibleAfter as CharData["facts"][number]["visibleAfter"] })),
    actors: c.actors.map((a) => ({
      actorName: a.actorName,
      actorTmdbId: a.actorTmdbId,
      note: a.note,
      visibleAfter: a.visibleAfter as CharData["visibleAfter"],
      imageUrl: a.actorTmdbId ? imageMap.get(a.actorTmdbId) ?? null : null,
    })),
    nameAliases: ((c.nameAliases ?? []) as Array<{ name?: string; visibleAfter?: unknown }>)
      .filter((n): n is { name: string; visibleAfter: CharData["visibleAfter"] } => typeof n?.name === "string")
      .map((n) => ({ name: n.name, visibleAfter: (n.visibleAfter ?? {}) as CharData["visibleAfter"] })),
    groupHistory: ((c.groupHistory ?? []) as Array<{ group?: string; visibleAfter?: unknown }>)
      .filter((g): g is { group: string; visibleAfter: CharData["visibleAfter"] } => typeof g?.group === "string" && g.group.length > 0)
      .map((g) => ({ group: g.group, visibleAfter: (g.visibleAfter ?? {}) as CharData["visibleAfter"] })),
  }));

  // Resolved community-approved suggestions for the "community-sourced"
  // badge. Uses targetId for edits and appliedItemId for adds. We keep the
  // two sets merged so the viewer just checks one Set per item.
  const approvedSuggestions = await prisma.companionSuggestion.findMany({
    where: { companionId: companion.id, status: { in: ["approved"] } },
    select: { targetType: true, targetId: true, appliedItemId: true },
  });
  const communityItemIds = new Set<string>();
  for (const s of approvedSuggestions) {
    if (s.targetId) communityItemIds.add(`${s.targetType}:${s.targetId}`);
    if (s.appliedItemId) communityItemIds.add(`${s.targetType}:${s.appliedItemId}`);
  }

  // Recap-tab payload for movies. The recap chunk now produces two
  // blocks per generation — an installment recap for THIS film, and a
  // series recap covering every prior franchise installment plus this
  // one in a single 150-250 word paragraph. Both are stored in the
  // current companion's `recaps.current` object; no cross-companion
  // stitching needed at read time. Series block may be null for
  // standalone films.
  const recapBlob = (companion.recaps && typeof companion.recaps === "object" && !Array.isArray(companion.recaps))
    ? (companion.recaps as { current?: { installment?: unknown; series?: unknown; text?: unknown } })
    : null;
  const movieRecap = recapBlob?.current
    ? {
        // Tolerate the legacy `text` shape (pre-installment/series split)
        // by reading it as the installment block when present.
        installment: typeof recapBlob.current.installment === "string"
          ? recapBlob.current.installment
          : typeof recapBlob.current.text === "string"
            ? recapBlob.current.text
            : "",
        series: typeof recapBlob.current.series === "string" ? recapBlob.current.series : null,
      }
    : null;

  const data: WatchCompanionData = {
    id: companion.id,
    tmdbId: companion.tmdbId,
    title: companion.title,
    mediaType: "movie",
    runtimeSeconds: companion.runtimeSeconds,
    seasonsGenerated: companion.seasonsGenerated,
    communityItemIds: Array.from(communityItemIds),
    characters,
    relationships: companion.relationships.map((r) => ({ ...r, seasonNumber: r.seasonNumber, visibleAfter: r.visibleAfter as WatchCompanionData["relationships"][number]["visibleAfter"] })),
    timeline: companion.timeline.map((t) => ({ ...t, seasonNumber: t.seasonNumber, visibleAfter: t.visibleAfter as WatchCompanionData["timeline"][number]["visibleAfter"] })),
    glossary: companion.glossary.map((g) => ({ ...g, seasonNumber: g.seasonNumber, visibleAfter: g.visibleAfter as WatchCompanionData["glossary"][number]["visibleAfter"] })),
    recaps: movieRecap && (movieRecap.installment.length > 0 || movieRecap.series)
      ? { movie: { installment: movieRecap.installment, series: movieRecap.series } }
      : undefined,
  };

  return (
    <div>
      <header className="bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link href={`/movies/${id}`} className="text-[var(--foreground-muted)] hover:text-white transition-colors" aria-label="Back to movie page">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <BookOpen className="w-4 h-4 text-[var(--ratist-red)]" />
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

      <ShareNudge
        url={`${SITE_URL}/movies/${id}/companion`}
        text={`Watch Companion for ${companion.title} — a spoiler-safe viewing guide on The Ratist.`}
        cardImageUrl={`${SITE_URL}/api/og/watch-companion?id=${companion.id}`}
      />
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

