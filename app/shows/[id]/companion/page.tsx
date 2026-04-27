import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MonitorPlay } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getShowDetails, posterUrl } from "@/lib/tmdb";
import WatchCompanionView, { type WatchCompanionData } from "@/components/watch-companion/WatchCompanionView";
import ShareButton from "@/components/ShareButton";
import CompanionNotAvailable from "@/components/watch-companion/CompanionNotAvailable";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.theratist.com";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ s?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const tmdbId = Number(id);
  try {
    const show = await getShowDetails(tmdbId);
    const companion = await prisma.watchCompanion.findUnique({
      where: { tmdbId_mediaType: { tmdbId, mediaType: "tv" } },
      select: { id: true },
    });
    // Pass the season query param through to the OG endpoint so shared
    // deep-links (e.g., /shows/123/companion?s=5 from a follow-flow
    // notification) render an OG card scoped to that season. When
    // unspecified, the OG endpoint defaults to the latest airing or
    // fully-generated season.
    const seasonParam = sp?.s && /^\d+$/.test(sp.s) ? `&season=${sp.s}` : "";
    const ogUrl = companion ? `${SITE_URL}/api/og/watch-companion?id=${companion.id}${seasonParam}` : undefined;
    return {
      title: `${show.name} — Watch Companion`,
      description: `Spoiler-safe reference guide for ${show.name}: characters, relationships, and plot points as you watch.`,
      alternates: { canonical: `/shows/${id}/companion` },
      openGraph: ogUrl ? { images: [{ url: ogUrl, width: 1200, height: 630 }] } : undefined,
      twitter: ogUrl ? { card: "summary_large_image", images: [ogUrl] } : undefined,
      // Pages without a generated companion just render a "request this"
      // UX — that's thin content from Google's POV and was showing up in
      // GSC as "Crawled - currently not indexed". Tell Google not to
      // bother until we actually have the recap data; once a companion
      // row is created, this auto-flips back to indexable.
      ...(companion ? {} : { robots: { index: false, follow: true } }),
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
      airingSeasons: {
        select: { seasonNumber: true, episodesGenerated: true, status: true },
        orderBy: { seasonNumber: "asc" },
      },
    },
  });

  if (!companion || companion.status !== "published") {
    // Fall back to the interactive generate/request UX, fetching the show
    // name + season list so the user can pick which season they want.
    let showName = "this show";
    let seasons: number[] = [];
    try {
      const show = await getShowDetails(tmdbId);
      showName = show.name;
      seasons = (show.seasons ?? [])
        .filter((s) => s.season_number > 0)
        .map((s) => s.season_number);
    } catch { /* best-effort */ }
    return <CompanionNotAvailable tmdbId={tmdbId} mediaType="tv" title={showName} availableSeasons={seasons} />;
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

  // Gather every actor id referenced — the primary actor on each character
  // OR any side-table actor row — so multi-actor characters get all their
  // portraits loaded in one DB round trip.
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

  const approvedSuggestions = await prisma.companionSuggestion.findMany({
    where: { companionId: companion.id, status: { in: ["approved"] } },
    select: { targetType: true, targetId: true, appliedItemId: true },
  });
  const communityItemIds = new Set<string>();
  for (const s of approvedSuggestions) {
    if (s.targetId) communityItemIds.add(`${s.targetType}:${s.targetId}`);
    if (s.appliedItemId) communityItemIds.add(`${s.targetType}:${s.appliedItemId}`);
  }

  // Per-season recap content from the companion's recaps JSON. Each
  // season's slot is { installment, series } where series is null
  // for S1 (no prior seasons to compress). The viewer reads only the
  // slot for the season the user is currently viewing — no stacking.
  // Tolerates the legacy `{ "1": "string" }` shape from the prior
  // schema by promoting bare strings into the installment field.
  const recapsBlob = (companion.recaps && typeof companion.recaps === "object" && !Array.isArray(companion.recaps))
    ? (companion.recaps as Record<string, unknown>)
    : null;
  const seasonRecaps: Record<string, { installment: string; series: string | null }> = {};
  if (recapsBlob) {
    for (const [k, v] of Object.entries(recapsBlob)) {
      if (!/^\d+$/.test(k)) continue;
      if (typeof v === "string" && v.length > 0) {
        seasonRecaps[k] = { installment: v, series: null };
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        const slot = v as { installment?: unknown; series?: unknown };
        const installment = typeof slot.installment === "string" ? slot.installment : "";
        if (installment.length === 0) continue;
        seasonRecaps[k] = {
          installment,
          series: typeof slot.series === "string" && slot.series.length > 0 ? slot.series : null,
        };
      }
    }
  }

  // Airing-season rows let the viewer surface "airing now" labels in the
  // dropdown and a Follow button + 2-day-delay copy on airing seasons.
  // Filter to "airing" status here — completed rows are already reflected
  // in seasonsGenerated.
  const airingSeasons = (companion.airingSeasons ?? [])
    .filter((a) => a.status === "airing")
    .map((a) => ({
      seasonNumber: a.seasonNumber,
      episodesGenerated: a.episodesGenerated,
    }));

  const data: WatchCompanionData = {
    id: companion.id,
    tmdbId: companion.tmdbId,
    title: companion.title,
    mediaType: "tv",
    runtimeSeconds: null,
    seasonsGenerated: companion.seasonsGenerated,
    airingSeasons: airingSeasons.length > 0 ? airingSeasons : undefined,
    communityItemIds: Array.from(communityItemIds),
    characters,
    relationships: companion.relationships.map((r) => ({ ...r, seasonNumber: r.seasonNumber, visibleAfter: r.visibleAfter as WatchCompanionData["relationships"][number]["visibleAfter"] })),
    timeline: companion.timeline.map((t) => ({ ...t, seasonNumber: t.seasonNumber, visibleAfter: t.visibleAfter as WatchCompanionData["timeline"][number]["visibleAfter"] })),
    glossary: companion.glossary.map((g) => ({ ...g, seasonNumber: g.seasonNumber, visibleAfter: g.visibleAfter as WatchCompanionData["glossary"][number]["visibleAfter"] })),
    recaps: Object.keys(seasonRecaps).length > 0 ? { bySeason: seasonRecaps } : undefined,
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
            // The viewer keeps ?s= in sync with the user's selected season,
            // so we forward it onto the share URL (?s=N for the page) and
            // onto the OG card URL (&season=N for the API endpoint). Result:
            // a viewer reading S1 shares /shows/123/companion?s=1 and the
            // social card renders S1's stats + map.
            forwardParams={[{ from: "s", toShare: "s", toCardImage: "season" }]}
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

