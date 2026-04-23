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
  const groupColor = new Map<string, string>();
  for (const n of nodes) {
    if (n.group && !groupColor.has(n.group)) {
      groupColor.set(n.group, GROUP_COLORS[groupColor.size % GROUP_COLORS.length]);
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
    const color = n.group ? groupColor.get(n.group) ?? "#6b7280" : "#6b7280";
    return `<circle cx="${p.x}" cy="${p.y}" r="${nodeRadius}" fill="${color}" stroke="${color}" stroke-width="1.5" />`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${edgesSvg}${nodesSvg}</svg>`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companionId = searchParams.get("id") ?? "";
  const season = searchParams.get("season"); // optional — formats label

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
        _count: {
          select: { characters: true, relationships: true, timeline: true, glossary: true },
        },
      },
    });
    if (!companion) return new Response("Not found", { status: 404 });

    // Pull just enough data for the abstract map. Cap to 15 nodes / 20 edges
    // so the SVG stays legible at card size.
    const seasonFilter = season ? { seasonNumber: parseInt(season, 10) } : {};
    const characters = await prisma.companionCharacter.findMany({
      where: { companionId: companion.id, ...seasonFilter },
      select: { id: true, group: true },
      take: 15,
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

    const edges = rels
      .map((r) => {
        const fromIdx = idToIdx.get(r.fromCharacterId);
        const toIdx = idToIdx.get(r.toCharacterId);
        if (fromIdx === undefined || toIdx === undefined) return null;
        return { fromIdx, toIdx, type: r.relationshipType };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // Poster + title-row meta (rating, runtime, genres). Pulling from the
    // local DB instead of TMDB — these rows are kept warm by the main site
    // traffic, and falling back to nulls is fine for the card.
    let posterPath: string | null = null;
    let metaPieces: string[] = [];
    if (companion.mediaType === "movie") {
      const movie = await prisma.movie.findUnique({
        where: { tmdbId: companion.tmdbId },
        select: {
          posterPath: true, runtime: true, mpaaRating: true,
          genres: { select: { genre: { select: { name: true } } }, take: 3 },
        },
      });
      posterPath = movie?.posterPath ?? null;
      if (movie?.mpaaRating) metaPieces.push(movie.mpaaRating);
      if (movie?.runtime) metaPieces.push(`${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`);
      const g = movie?.genres?.map((mg) => mg.genre.name).filter(Boolean) ?? [];
      if (g.length > 0) metaPieces.push(g.slice(0, 2).join(" · "));
    } else {
      const show = await prisma.tVShow.findUnique({
        where: { tmdbId: companion.tmdbId },
        select: {
          posterPath: true, episodeRunTime: true, contentRating: true, numberOfSeasons: true,
          genres: { select: { genre: { select: { name: true } } }, take: 3 },
        },
      });
      posterPath = show?.posterPath ?? null;
      if (show?.contentRating) metaPieces.push(show.contentRating);
      if (show?.episodeRunTime) metaPieces.push(`${show.episodeRunTime}m episodes`);
      const g = show?.genres?.map((sg) => sg.genre.name).filter(Boolean) ?? [];
      if (g.length > 0) metaPieces.push(g.slice(0, 2).join(" · "));
    }
    const posterUrl = posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : null;

    const mapSvg = abstractMapSvg(characters, edges, 420);
    const mapDataUrl = `data:image/svg+xml;base64,${Buffer.from(mapSvg).toString("base64")}`;

    const seasonLabel = companion.mediaType === "tv" && season
      ? `Season ${season}`
      : companion.mediaType === "tv" && companion.seasonsGenerated.length > 0
      ? `S${companion.seasonsGenerated.join(", S")}`
      : null;

    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 32, justifyContent: "space-between" }}>
            {/* Top block: logo + poster + title + movie meta */}
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
                  <span style={{ color: "white", fontSize: 38, fontWeight: 800, lineHeight: 1.05 }}>{companion.title}</span>
                  {seasonLabel && (
                    <span style={{ color: "#ef3b36", fontSize: 18, fontWeight: 700, marginTop: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                      {seasonLabel}
                    </span>
                  )}
                  {metaPieces.length > 0 && (
                    <span style={{ color: "#999", fontSize: 14, marginTop: 12, lineHeight: 1.4 }}>
                      {metaPieces.join("  ·  ")}
                    </span>
                  )}
                  <span style={{ color: "#666", fontSize: 12, marginTop: 8, lineHeight: 1.4 }}>
                    Spoiler-safe viewing guide — unlocks as you watch.
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom block: big companion stats, fills the lower-left space */}
            <div style={{ display: "flex", gap: 36, marginTop: 24 }}>
              {[
                { label: "Characters", value: String(companion._count.characters) },
                { label: "Connections", value: String(companion._count.relationships) },
                { label: "Plot beats", value: String(companion._count.timeline) },
                { label: "Terms", value: String(companion._count.glossary) },
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
