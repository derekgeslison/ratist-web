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
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 40 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 }}>
            <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
            <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: 1 }}>THE RATIST</span>
            <span style={{ color: "#ef3b36", fontSize: 14, fontWeight: 700, marginLeft: 12 }}>MATCHUP</span>
          </div>

          {/* Movies + scores */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 24 }}>
            {/* Movie 1 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 200 }}>
              {poster1 ? (
                <img src={poster1} width={100} height={150} style={{ borderRadius: 8, objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", width: 100, height: 150, borderRadius: 8, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#555", fontSize: 24 }}>?</span>
                </div>
              )}
              <span style={{ color: "white", fontSize: 14, fontWeight: 700, textAlign: "center" }}>
                {movie1.title.length > 25 ? movie1.title.slice(0, 25) + "..." : movie1.title}
              </span>
              {score1 != null && (
                <span style={{ color: scoreHex(score1), fontSize: 28, fontWeight: 900 }}>{score1.toFixed(1)}</span>
              )}
            </div>

            {/* VS */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#ef3b36", fontSize: 24, fontWeight: 900 }}>VS</span>
            </div>

            {/* Movie 2 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 200 }}>
              {poster2 ? (
                <img src={poster2} width={100} height={150} style={{ borderRadius: 8, objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", width: 100, height: 150, borderRadius: 8, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#555", fontSize: 24 }}>?</span>
                </div>
              )}
              <span style={{ color: "white", fontSize: 14, fontWeight: 700, textAlign: "center" }}>
                {movie2.title.length > 25 ? movie2.title.slice(0, 25) + "..." : movie2.title}
              </span>
              {score2 != null && (
                <span style={{ color: scoreHex(score2), fontSize: 28, fontWeight: 900 }}>{score2.toFixed(1)}</span>
              )}
            </div>
          </div>

          {/* Category comparison */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {cats.map(({ label, s1, s2 }) => {
              const v1 = s1 != null ? Math.round(s1 * 10) / 10 : null;
              const v2 = s2 != null ? Math.round(s2 * 10) / 10 : null;
              const c1 = v1 != null ? scoreHex(v1) : "#444";
              const c2 = v2 != null ? scoreHex(v2) : "#444";
              return (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: c1, fontSize: 14, fontWeight: 800, width: 32, textAlign: "right" }}>{v1?.toFixed(1) ?? "—"}</span>
                  <div style={{ flex: 1, height: 8, backgroundColor: "#1a1a1a", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                    {v1 != null && <div style={{ width: `${(v1 / 10) * 100}%`, height: 8, backgroundColor: c1, borderRadius: 4 }} />}
                  </div>
                  <span style={{ color: "#888", fontSize: 12, width: 80, textAlign: "center" }}>{label}</span>
                  <div style={{ flex: 1, height: 8, backgroundColor: "#1a1a1a", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                    {v2 != null && <div style={{ width: `${(v2 / 10) * 100}%`, height: 8, backgroundColor: c2, borderRadius: 4 }} />}
                  </div>
                  <span style={{ color: c2, fontSize: 14, fontWeight: 800, width: 32 }}>{v2?.toFixed(1) ?? "—"}</span>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: "auto", paddingTop: 12 }}>
            <span style={{ color: "#333", fontSize: 13 }}>theratist.com</span>
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
