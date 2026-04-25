import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64 } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

// Deterministic-ish group colors — same palette the public viewer uses, so
// the OG abstract map reads visually similar to the real thing.
const GROUP_COLORS = ["#e53e3e", "#3182ce", "#38a169", "#d69e2e", "#805ad5", "#dd6b20", "#319795", "#d53f8c"];

/**
 * Builds a compact abstract relationship-map SVG: characters as colored
 * circles arranged in a ring, edges as thin curves connecting a subset of
 * them. NO NAMES anywhere — the card is shareable without spoiling who
 * appears in the show.
 */
function abstractMapSvg(
  nodes: Array<{ group: string | null }>,
  edges: Array<{ fromIdx: number; toIdx: number; type: string }>,
  size: number,
): string {
  const center = size / 2;
  const radius = size * 0.4;
  const nodeRadius = Math.max(6, size * 0.018);

  // Map groups to colors deterministically (first seen = index 0).
  // Treat null, empty string, and whitespace-only strings as "no group"
  // so legacy data with " " or "" keys can't sneak into the palette and
  // pull GROUP_COLORS[0] (red) for what should be ungrouped characters.
  const groupColor = new Map<string, string>();
  const groupKey = (g: string | null) => {
    const trimmed = (g ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  for (const n of nodes) {
    const key = groupKey(n.group);
    if (key && !groupColor.has(key)) {
      groupColor.set(key, GROUP_COLORS[groupColor.size % GROUP_COLORS.length]);
    }
  }

  const positions = nodes.map((_, i) => {
    const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
  });

  const edgeColor: Record<string, string> = {
    romantic: "#ec4899",
    business: "#3b82f6",
    rivalry: "#ef4444",
    alliance: "#22c55e",
    mentor: "#a855f7",
    family: "#f59e0b",
    other: "#9ca3af",
  };

  const edgesSvg = edges.map((e) => {
    const from = positions[e.fromIdx];
    const to = positions[e.toIdx];
    if (!from || !to) return "";
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const cp = { x: mid.x + (center - mid.x) * 0.3, y: mid.y + (center - mid.y) * 0.3 };
    const color = edgeColor[e.type] ?? edgeColor.other;
    return `<path d="M ${from.x} ${from.y} Q ${cp.x} ${cp.y} ${to.x} ${to.y}" fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity="0.55" />`;
  }).join("");

  const nodesSvg = nodes.map((n, i) => {
    const p = positions[i];
    const key = groupKey(n.group);
    const color = key ? groupColor.get(key) ?? "#6b7280" : "#6b7280";
    return `<circle cx="${p.x}" cy="${p.y}" r="${nodeRadius}" fill="${color}" stroke="${color}" stroke-width="1.5" />`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${edgesSvg}${nodesSvg}</svg>`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companionId = searchParams.get("id") ?? "";
  const seasonParam = searchParams.get("season"); // optional — caller-specified season override

  try {
    const logoSrc = getLogoBase64();
    const companion = await prisma.watchCompanion.findUnique({
      where: { id: companionId },
      select: {
        id: true,
        title: true,
        tmdbId: true,
        mediaType: true,
        seasonsGenerated: true,
        airingSeasons: {
          select: { seasonNumber: true, status: true },
          orderBy: { seasonNumber: "desc" },
        },
      },
    });
    if (!companion) return new Response("Not found", { status: 404 });

    // Pick a target season for TV companions. The OG card needs to reflect
    // ONE season's reality — without a season filter, a multi-season show
    // returns a hodgepodge of characters across seasons whose groups
    // partially clash, which is what produced the "wrong-looking map +
    // wrong group colors" cards. Default precedence:
    //   1. ?season=N URL param (caller-specified)
    //   2. Latest airing-status season (if any)
    //   3. Latest fully-generated season
    //   4. null (movie or no content yet)
    let targetSeason: number | null = null;
    if (companion.mediaType === "tv") {
      const airingLatest = companion.airingSeasons.find((a) => a.status === "airing")?.seasonNumber;
      const generatedLatest = companion.seasonsGenerated.length > 0
        ? Math.max(...companion.seasonsGenerated)
        : null;
      const fromParam = seasonParam ? parseInt(seasonParam, 10) : NaN;
      targetSeason = Number.isFinite(fromParam) && fromParam > 0
        ? fromParam
        : airingLatest ?? generatedLatest;
    }
    const seasonFilter = targetSeason !== null ? { seasonNumber: targetSeason } : {};

    // Pull just enough data for the abstract map. Cap to 20 nodes / 30 edges
    // — enough to give every group at least one representative without
    // making the ring unreadably dense.
    const characters = await prisma.companionCharacter.findMany({
      where: { companionId: companion.id, ...seasonFilter },
      select: { id: true, group: true },
      take: 20,
      orderBy: { sortOrder: "asc" },
    });
    const idToIdx = new Map(characters.map((c, i) => [c.id, i]));
    const rels = await prisma.companionRelationship.findMany({
      where: {
        companionId: companion.id,
        ...seasonFilter,
        fromCharacterId: { in: characters.map((c) => c.id) },
        toCharacterId: { in: characters.map((c) => c.id) },
      },
      select: { fromCharacterId: true, toCharacterId: true, relationshipType: true },
      take: 30,
    });

    // Season-scoped stats. Using companion._count would aggregate across
    // every season, which is misleading once we've picked a single
    // season's worth of characters/relationships to draw.
    const [charactersCount, relationshipsCount, timelineCount, glossaryCount] = await Promise.all([
      prisma.companionCharacter.count({ where: { companionId: companion.id, ...seasonFilter } }),
      prisma.companionRelationship.count({ where: { companionId: companion.id, ...seasonFilter } }),
      prisma.companionTimelineEvent.count({ where: { companionId: companion.id, ...seasonFilter } }),
      prisma.companionGlossaryTerm.count({ where: { companionId: companion.id, ...seasonFilter } }),
    ]);
    const stats = {
      characters: charactersCount,
      relationships: relationshipsCount,
      timeline: timelineCount,
      glossary: glossaryCount,
    };

    const edges = rels
      .map((r) => {
        const fromIdx = idToIdx.get(r.fromCharacterId);
        const toIdx = idToIdx.get(r.toCharacterId);
        if (fromIdx === undefined || toIdx === undefined) return null;
        return { fromIdx, toIdx, type: r.relationshipType };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // Poster, year, and meta pills (rating + runtime + 1–2 genres). Pulled
    // from the local DB — these rows are kept warm by site traffic. Each
    // pill is rendered as a separate element so pills that would be blank
    // (no MPAA rating, no runtime, etc.) simply don't appear.
    let posterPath: string | null = null;
    let year: string | null = null;
    const metaPills: string[] = [];
    if (companion.mediaType === "movie") {
      const movie = await prisma.movie.findUnique({
        where: { tmdbId: companion.tmdbId },
        select: {
          posterPath: true, runtime: true, mpaaRating: true, releaseDate: true,
          genres: { select: { genre: { select: { name: true } } }, take: 3 },
        },
      });
      posterPath = movie?.posterPath ?? null;
      if (movie?.releaseDate) year = movie.releaseDate.slice(0, 4);
      if (movie?.mpaaRating) metaPills.push(movie.mpaaRating);
      if (movie?.runtime) metaPills.push(`${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`);
      for (const mg of movie?.genres ?? []) {
        if (mg.genre?.name) metaPills.push(mg.genre.name);
      }
    } else {
      const show = await prisma.tVShow.findUnique({
        where: { tmdbId: companion.tmdbId },
        select: {
          posterPath: true, episodeRunTime: true, contentRating: true, numberOfSeasons: true,
          firstAirDate: true, lastAirDate: true, status: true,
          genres: { select: { genre: { select: { name: true } } }, take: 3 },
        },
      });
      posterPath = show?.posterPath ?? null;
      if (show?.firstAirDate) {
        const startYear = show.firstAirDate.slice(0, 4);
        const endYear = show.lastAirDate && show.status === "Ended" ? show.lastAirDate.slice(0, 4) : null;
        year = endYear && endYear !== startYear ? `${startYear}–${endYear}` : startYear;
      }
      if (show?.contentRating) metaPills.push(show.contentRating);
      if (show?.episodeRunTime) metaPills.push(`~${show.episodeRunTime}m episodes`);
      if (show?.numberOfSeasons && show.numberOfSeasons > 0) {
        metaPills.push(`${show.numberOfSeasons} season${show.numberOfSeasons === 1 ? "" : "s"}`);
      }
      for (const sg of show?.genres ?? []) {
        if (sg.genre?.name) metaPills.push(sg.genre.name);
      }
    }
    // Cap at 5 pills so we don't overflow the left column visually.
    const pillsToShow = metaPills.slice(0, 5);
    const posterUrl = posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : null;

    const mapSvg = abstractMapSvg(characters, edges, 420);
    const mapDataUrl = `data:image/svg+xml;base64,${Buffer.from(mapSvg).toString("base64")}`;

    const seasonLabel = companion.mediaType === "tv" && targetSeason !== null
      ? `Season ${targetSeason}`
      : null;

    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 32, justifyContent: "space-between" }}>
            {/* Top block: logo + poster + title + meta pills + tagline */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <img src={logoSrc} width={36} height={36} style={{ borderRadius: 6 }} />
                <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: 1 }}>THE RATIST · WATCH COMPANION</span>
              </div>

              <div style={{ display: "flex", gap: 20 }}>
                {posterUrl && (
                  <img src={posterUrl} width={140} height={210} style={{ borderRadius: 8, objectFit: "cover" }} />
                )}
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <span style={{ color: "white", fontSize: 40, fontWeight: 800, lineHeight: 1.05 }}>{companion.title}</span>
                  {year && (
                    <span style={{ color: "#bbb", fontSize: 22, fontWeight: 600, marginTop: 4 }}>{year}</span>
                  )}
                  {seasonLabel && (
                    <span style={{ color: "#ef3b36", fontSize: 18, fontWeight: 700, marginTop: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                      {seasonLabel}
                    </span>
                  )}
                </div>
              </div>

              {/* Meta pills — rating, runtime, genres. Each is its own
                 rounded chip so a missing MPAA rating just means one fewer
                 pill instead of an awkward "null · 2h 15m" string. */}
              {pillsToShow.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
                  {pillsToShow.map((pill) => (
                    <span
                      key={pill}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        backgroundColor: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        color: "#ccc",
                        fontSize: 16,
                        fontWeight: 600,
                        padding: "6px 14px",
                        borderRadius: 999,
                      }}
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              )}

              {/* Bigger tagline since the user called out this as the card's
                 narrative hook — what is a Watch Companion? */}
              <span style={{ color: "white", fontSize: 22, fontWeight: 600, marginTop: 24, lineHeight: 1.35 }}>
                Spoiler-safe viewing guide — characters, relationships, and plot beats unlock as you watch.
              </span>
            </div>

            {/* Bottom block: big companion stats, fills the lower-left space */}
            <div style={{ display: "flex", gap: 36, marginTop: 24 }}>
              {[
                { label: "Characters", value: String(stats.characters) },
                { label: "Connections", value: String(stats.relationships) },
                { label: "Plot beats", value: String(stats.timeline) },
                { label: "Terms", value: String(stats.glossary) },
              ].map((stat) => (
                <div key={stat.label} style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ color: "white", fontSize: 52, fontWeight: 800, lineHeight: 1 }}>{stat.value}</span>
                  <span style={{ color: "#999", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginTop: 4 }}>{stat.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Abstract relationship map — no names, purely visual. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 440, height: 440 }}>
            <img src={mapDataUrl} width={420} height={420} />
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (err) {
    console.error("Watch Companion OG error:", err);
    return new Response("Error generating image", { status: 500 });
  }
}
