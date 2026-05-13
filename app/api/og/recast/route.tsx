import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64 } from "@/lib/og-helpers";
import { OG_W, OG_H, OgHeader, OgEmptyState, VoteStats, RED, CREAM, truncate } from "@/lib/og-community";

export const dynamic = "force-dynamic";

const TMDB_PROFILE = "https://image.tmdb.org/t/p/w342";
const TMDB_POSTER = "https://image.tmdb.org/t/p/w342";

export async function GET() {
  try {
    const logoSrc = getLogoBase64();
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const recent = await prisma.recast.findMany({
      where: { createdAt: { gte: since } },
      include: { votes: { select: { value: true } } },
    });

    const enrich = <T extends { votes: { value: number }[] }>(r: T) => ({
      ...r,
      total: r.votes.length,
      net: r.votes.reduce((s, v) => s + v.value, 0),
    });
    let scored = recent.map(enrich).sort((a, b) => b.net - a.net || +b.createdAt - +a.createdAt);
    let top = scored[0];

    if (!top) {
      const fallback = await prisma.recast.findMany({
        include: { votes: { select: { value: true } } },
      });
      scored = fallback.map(enrich).sort((a, b) => b.net - a.net);
      top = scored[0];
    }

    // Original actor profile (need to fetch from Celebrity table if we have
    // their tmdbId — Recast row doesn't store the original actor's profile path).
    let originalActorProfile: string | null = null;
    if (top?.originalActorTmdbId) {
      const celeb = await prisma.celebrity.findUnique({
        where: { tmdbId: top.originalActorTmdbId },
        select: { profilePath: true },
      });
      originalActorProfile = celeb?.profilePath ?? null;
    }

    // Sizing for the middle row. Poster bumped up to match the original-
    // actor card so they read as a balanced visual pair, with the divider
    // line centered between them.
    const POSTER_W = 190;
    const POSTER_H = 240;
    const ORIG_W = 190;
    const ORIG_H = 240;
    const SUGG_W = 220;
    const SUGG_H = 280;

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: OG_W,
            height: OG_H,
            backgroundColor: "#0a0a0a",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 0,
              top: 0,
              width: OG_W,
              height: OG_H,
              background: "linear-gradient(135deg, #1a0410 0%, #0a0a0a 60%)",
            }}
          />

          <OgHeader logoSrc={logoSrc} eyebrow="RECAST" url="theratist.com/community/recast" />

          {top ? (
            <>
              {/* Vote stats top-right */}
              <div style={{ display: "flex", position: "absolute", top: 90, right: 60 }}>
                <VoteStats total={top.total} net={top.net} accent={RED} />
              </div>

              {/* Character + movie context — moved up */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  position: "absolute",
                  left: 60,
                  top: 80,
                  width: 800,
                }}
              >
                <span style={{ color: "#888", fontSize: 13, fontWeight: 800, letterSpacing: 2.5 }}>
                  RECAST
                </span>
                <span
                  style={{
                    color: "white",
                    fontSize: characterSize(top.characterName),
                    fontWeight: 900,
                    lineHeight: 1.05,
                    marginTop: 6,
                    textShadow: "0 2px 6px #000",
                    maxWidth: 800,
                  }}
                >
                  {top.characterName}
                </span>
                <span style={{ color: "#bbb", fontSize: 18, marginTop: 6, fontStyle: "italic" }}>
                  in {truncate(top.movieTitle, 60)}
                </span>
              </div>

              {/* Middle row: [poster] — [vertical divider centered in gap] —
                  [original actor (struck)] → [suggested actor].
                  Poster is anchored to a fixed left margin (more left-aligned),
                  and the divider sits at the midpoint between poster and
                  original-actor card so it visually separates them. */}
              {(() => {
                const POSTER_X = 60;
                const POSTER_TO_ORIG_GAP = 100;
                const GAP_AFTER_ORIG = 36;
                const ARROW_W = 56;
                const GAP_AFTER_ARROW = 36;

                const posterX = POSTER_X;
                const origX = posterX + POSTER_W + POSTER_TO_ORIG_GAP;
                const lineX = Math.round(posterX + POSTER_W + POSTER_TO_ORIG_GAP / 2);
                const arrowX = origX + ORIG_W + GAP_AFTER_ORIG;
                const suggX = arrowX + ARROW_W + GAP_AFTER_ARROW;

                // Vertical centers: suggested card is tallest at SUGG_H.
                // Other items align with the box center of the suggested card.
                const ROW_TOP = 220;
                const suggCenter = ROW_TOP + SUGG_H / 2;

                return (
                  <>
                    {/* Movie poster */}
                    {top.posterPath && (
                      <div
                        style={{
                          display: "flex",
                          position: "absolute",
                          left: posterX,
                          top: suggCenter - POSTER_H / 2,
                          width: POSTER_W,
                          height: POSTER_H,
                          border: `4px solid ${CREAM}`,
                          backgroundColor: "#1a1a1a",
                          boxShadow: "0 14px 30px rgba(0,0,0,0.7)",
                          overflow: "hidden",
                        }}
                      >
                        <img
                          src={`${TMDB_POSTER}${top.posterPath}`}
                          width={POSTER_W}
                          height={POSTER_H}
                          style={{ objectFit: "cover" }}
                        />
                      </div>
                    )}

                    {/* Vertical divider line */}
                    <div
                      style={{
                        display: "flex",
                        position: "absolute",
                        left: lineX,
                        top: suggCenter - POSTER_H / 2,
                        width: 2,
                        height: POSTER_H,
                        backgroundColor: "rgba(255,255,255,0.18)",
                      }}
                    />

                    {/* Original actor (struck through) */}
                    <ActorCard
                      x={origX}
                      y={suggCenter - ORIG_H / 2}
                      width={ORIG_W}
                      height={ORIG_H}
                      imgSrc={originalActorProfile ? `${TMDB_PROFILE}${originalActorProfile}` : null}
                      label="ORIGINAL"
                      name={top.originalActorName}
                      dim
                      strike
                    />

                    {/* Arrow badge between actors */}
                    <div
                      style={{
                        display: "flex",
                        position: "absolute",
                        left: arrowX,
                        top: suggCenter - 28,
                        width: ARROW_W,
                        height: 56,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: RED,
                        borderRadius: 28,
                        boxShadow: "0 0 24px rgba(204,0,51,0.5)",
                      }}
                    >
                      <span style={{ color: "white", fontSize: 32, fontWeight: 900, lineHeight: 1 }}>
                        →
                      </span>
                    </div>

                    {/* Suggested actor (highlighted, largest) */}
                    <ActorCard
                      x={suggX}
                      y={suggCenter - SUGG_H / 2}
                      width={SUGG_W}
                      height={SUGG_H}
                      imgSrc={top.suggestedActorProfile ? `${TMDB_PROFILE}${top.suggestedActorProfile}` : null}
                      label="RECAST AS"
                      name={top.suggestedActorName}
                    />
                  </>
                );
              })()}
            </>
          ) : (
            <OgEmptyState
              line1="Recast the role."
              line2="Make your first pick at theratist.com/community/recast"
            />
          )}
        </div>
      ),
      { width: OG_W, height: OG_H }
    );
  } catch (err) {
    console.error("OG recast error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}

function characterSize(s: string): number {
  if (s.length <= 22) return 56;
  if (s.length <= 38) return 44;
  return 36;
}

function ActorCard({
  x,
  y,
  width,
  height,
  imgSrc,
  label,
  name,
  dim,
  strike,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  imgSrc: string | null;
  label: string;
  name: string;
  dim?: boolean;
  strike?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        left: x,
        top: y,
        width,
        alignItems: "center",
      }}
    >
      <span
        style={{
          color: dim ? "#666" : RED,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 2.2,
          marginBottom: 8,
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "flex",
          width,
          height,
          borderRadius: 14,
          border: `4px solid ${dim ? "#444" : RED}`,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 22px rgba(0,0,0,0.7)",
          opacity: dim ? 0.7 : 1,
        }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            width={width}
            height={height}
            style={{ objectFit: "cover", objectPosition: "top" }}
          />
        ) : (
          <span style={{ color: "white", fontSize: 60, fontWeight: 900 }}>
            {name[0]?.toUpperCase() ?? "?"}
          </span>
        )}
      </div>
      <span
        style={{
          color: dim ? "#aaa" : "white",
          fontSize: 18,
          fontWeight: 800,
          marginTop: 12,
          maxWidth: width + 30,
          textAlign: "center",
          lineHeight: 1.1,
          textDecoration: strike ? "line-through" : "none",
        }}
      >
        {name}
      </span>
    </div>
  );
}
