import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbId1 = Number(searchParams.get("movie1") ?? "0");
  const tmdbId2 = Number(searchParams.get("movie2") ?? "0");

  try {
    const logoSrc = getLogoBase64();

    const [movie1, movie2] = await Promise.all([
      prisma.movie.findUnique({ where: { tmdbId: tmdbId1 }, select: { id: true, title: true, posterPath: true, voteAverage: true } }),
      prisma.movie.findUnique({ where: { tmdbId: tmdbId2 }, select: { id: true, title: true, posterPath: true, voteAverage: true } }),
    ]);
    if (!movie1 || !movie2) return new Response("Not found", { status: 404 });

    const [agg1, agg2] = await Promise.all([
      prisma.movieRating.aggregate({
        where: { movieId: movie1.id, ratistRating: { not: null } },
        _avg: { ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true },
        _sum: { ratistRating: true }, _count: { ratistRating: true },
      }),
      prisma.movieRating.aggregate({
        where: { movieId: movie2.id, ratistRating: { not: null } },
        _avg: { ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true },
        _sum: { ratistRating: true }, _count: { ratistRating: true },
      }),
    ]);

    function hybrid(tmdb: number | null, count: number, sum: number): number | null {
      if (tmdb == null && count === 0) return null;
      if (tmdb == null) return Math.round((sum / count) * 10) / 10;
      const buffer = Math.max(0, 50 - count);
      return Math.round(((tmdb * buffer + sum) / Math.max(50, count)) * 10) / 10;
    }

    const score1 = hybrid(movie1.voteAverage, agg1._count.ratistRating, agg1._sum.ratistRating ?? 0);
    const score2 = hybrid(movie2.voteAverage, agg2._count.ratistRating, agg2._sum.ratistRating ?? 0);

    const cats = [
      { label: "Story", s1: agg1._avg.storyScore, s2: agg2._avg.storyScore },
      { label: "Style", s1: agg1._avg.styleScore, s2: agg2._avg.styleScore },
      { label: "Emotion", s1: agg1._avg.emotiveScore, s2: agg2._avg.emotiveScore },
      { label: "Acting", s1: agg1._avg.actingScore, s2: agg2._avg.actingScore },
      { label: "Fun", s1: agg1._avg.entertainScore, s2: agg2._avg.entertainScore },
    ];

    const poster1 = movie1.posterPath ? `https://image.tmdb.org/t/p/w185${movie1.posterPath}` : null;
    const poster2 = movie2.posterPath ? `https://image.tmdb.org/t/p/w185${movie2.posterPath}` : null;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 36 }}>
          {/* Top: R logo + THE RATIST centered */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20 }}>
            <img src={logoSrc} width={30} height={30} style={{ borderRadius: 6 }} />
            <span style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>THE RATIST</span>
          </div>

          {/* Movies row: poster1 — matchup icon — poster2 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 20 }}>
            {/* Movie 1 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 180 }}>
              {poster1 ? (
                <img src={poster1} width={90} height={135} style={{ borderRadius: 8, objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", width: 90, height: 135, borderRadius: 8, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#555", fontSize: 20 }}>?</span>
                </div>
              )}
              <span style={{ color: "white", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
                {movie1.title.length > 22 ? movie1.title.slice(0, 22) + "..." : movie1.title}
              </span>
              {score1 != null && (
                <span style={{ color: scoreHex(score1), fontSize: 24, fontWeight: 900 }}>{score1.toFixed(1)}</span>
              )}
            </div>

            {/* Matchup icon (crossed swords via simple X shape) + MATCHUP text */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef3b36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="4" x2="20" y2="20" />
                <line x1="20" y1="4" x2="4" y2="20" />
                <line x1="4" y1="4" x2="4" y2="8" />
                <line x1="4" y1="4" x2="8" y2="4" />
                <line x1="20" y1="4" x2="20" y2="8" />
                <line x1="20" y1="4" x2="16" y2="4" />
              </svg>
              <span style={{ color: "#ef3b36", fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>MATCHUP</span>
            </div>

            {/* Movie 2 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 180 }}>
              {poster2 ? (
                <img src={poster2} width={90} height={135} style={{ borderRadius: 8, objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", width: 90, height: 135, borderRadius: 8, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#555", fontSize: 20 }}>?</span>
                </div>
              )}
              <span style={{ color: "white", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
                {movie2.title.length > 22 ? movie2.title.slice(0, 22) + "..." : movie2.title}
              </span>
              {score2 != null && (
                <span style={{ color: scoreHex(score2), fontSize: 24, fontWeight: 900 }}>{score2.toFixed(1)}</span>
              )}
            </div>
          </div>

          {/* Category comparison bars */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            {cats.map(({ label, s1, s2 }) => {
              const v1 = s1 != null ? Math.round(s1 * 10) / 10 : null;
              const v2 = s2 != null ? Math.round(s2 * 10) / 10 : null;
              const c1 = v1 != null ? scoreHex(v1) : "#444";
              const c2 = v2 != null ? scoreHex(v2) : "#444";
              return (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: c1, fontSize: 13, fontWeight: 800, width: 30, textAlign: "right" }}>{v1?.toFixed(1) ?? "—"}</span>
                  <div style={{ flex: 1, height: 7, backgroundColor: "#1a1a1a", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                    {v1 != null && <div style={{ width: `${(v1 / 10) * 100}%`, height: 7, backgroundColor: c1, borderRadius: 4 }} />}
                  </div>
                  <span style={{ color: "#777", fontSize: 11, width: 80, textAlign: "center" }}>{label}</span>
                  <div style={{ flex: 1, height: 7, backgroundColor: "#1a1a1a", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                    {v2 != null && <div style={{ width: `${(v2 / 10) * 100}%`, height: 7, backgroundColor: c2, borderRadius: 4 }} />}
                  </div>
                  <span style={{ color: c2, fontSize: 13, fontWeight: 800, width: 30 }}>{v2?.toFixed(1) ?? "—"}</span>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
            <span style={{ color: "#333", fontSize: 12 }}>theratist.com</span>
          </div>
        </div>
      ),
      { width: 700, height: 520 }
    );
  } catch (err) {
    console.error("OG matchup error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
