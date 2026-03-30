import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function scoreHex(score: number): string {
  if (score >= 8) return "#22c55e";
  if (score >= 6) return "#eab308";
  if (score >= 4) return "#f97316";
  return "#ef4444";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";
  const year = searchParams.get("year") ?? new Date().getFullYear().toString();

  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { firebaseUid: userId }] },
      select: { id: true, name: true },
    });
    if (!user) return new Response("Not found", { status: 404 });

    const seenThisYear = await prisma.userFavoriteMovie.findMany({
      where: {
        userId: user.id,
        OR: [
          { watchedDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${Number(year) + 1}-01-01`) } },
          { AND: [{ watchedDate: null }, { createdAt: { gte: new Date(`${year}-01-01`), lt: new Date(`${Number(year) + 1}-01-01`) } }] },
        ],
      },
      include: {
        movie: {
          select: {
            tmdbId: true, title: true, posterPath: true,
            ratings: { where: { userId: user.id }, select: { ratistRating: true }, take: 1 },
          },
        },
      },
    });

    if (seenThisYear.length === 0) return new Response("No data", { status: 404 });

    const rated = seenThisYear.filter((m) => m.movie.ratings[0]?.ratistRating != null);
    const ratings = rated.map((m) => m.movie.ratings[0]!.ratistRating!);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    const topMovies = [...rated]
      .sort((a, b) => (b.movie.ratings[0]?.ratistRating ?? 0) - (a.movie.ratings[0]?.ratistRating ?? 0))
      .slice(0, 6);

    // Poster URLs for top movies
    const posterUrls = topMovies
      .filter((m) => m.movie.posterPath)
      .slice(0, 6)
      .map((m) => `https://image.tmdb.org/t/p/w185${m.movie.posterPath}`);

    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 630,
            display: "flex",
            background: "#0f0f0f",
            fontFamily: "sans-serif",
            padding: "52px 64px",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#ef3b36", fontWeight: 900, fontSize: 18, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                The Ratist · {year} in Film
              </span>
              <span style={{ color: "#ffffff", fontSize: 48, fontWeight: 900, lineHeight: 1.1 }}>
                {user.name}
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 24, marginBottom: 40 }}>
            {[
              { value: seenThisYear.length.toString(), label: "Movies Watched" },
              { value: rated.length.toString(), label: "Rated" },
              ...(avgRating != null ? [{ value: avgRating.toFixed(1), label: "Avg Rating", color: scoreHex(avgRating) }] : []),
              ...(topMovies[0] ? [{ value: (topMovies[0].movie.ratings[0]?.ratistRating ?? 0).toFixed(1), label: "Best Rating", color: scoreHex(topMovies[0].movie.ratings[0]?.ratistRating ?? 0) }] : []),
            ].map(({ value, label, color }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: "#1a1a1a",
                  borderRadius: 12,
                  padding: "16px 24px",
                  minWidth: 120,
                }}
              >
                <span style={{ color: color ?? "#ffffff", fontSize: 36, fontWeight: 900, lineHeight: 1 }}>
                  {value}
                </span>
                <span style={{ color: "#888888", fontSize: 14, marginTop: 6 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Poster grid */}
          {posterUrls.length > 0 && (
            <div style={{ display: "flex", gap: 12, flex: 1 }}>
              {posterUrls.map((url, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    borderRadius: 8,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                  {topMovies[i]?.movie.ratings[0]?.ratistRating != null && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 6,
                        right: 6,
                        background: "rgba(0,0,0,0.85)",
                        borderRadius: 6,
                        padding: "3px 8px",
                        color: scoreHex(topMovies[i].movie.ratings[0]!.ratistRating!),
                        fontWeight: 800,
                        fontSize: 16,
                      }}
                    >
                      {topMovies[i].movie.ratings[0]!.ratistRating!.toFixed(1)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 24, color: "#555555", fontSize: 16 }}>
            theratist.com
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch {
    return new Response("Error", { status: 500 });
  }
}
