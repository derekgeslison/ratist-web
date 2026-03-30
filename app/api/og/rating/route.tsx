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
  const tmdbId = searchParams.get("tmdbId") ?? "";

  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { firebaseUid: userId }] },
      select: { id: true, name: true, avatarUrl: true },
    });
    const movie = await prisma.movie.findUnique({
      where: { tmdbId: Number(tmdbId) },
      select: { tmdbId: true, title: true, posterPath: true, releaseDate: true },
    });
    if (!user || !movie) {
      return new Response("Not found", { status: 404 });
    }

    const rating = await prisma.movieRating.findFirst({
      where: { userId: user.id, movie: { tmdbId: Number(tmdbId) } },
      select: {
        ratistRating: true,
        storyScore: true, styleScore: true,
        emotiveScore: true, actingScore: true, entertainScore: true,
      },
    });
    if (!rating?.ratistRating) {
      return new Response("No rating", { status: 404 });
    }

    const posterUrl = movie.posterPath
      ? `https://image.tmdb.org/t/p/w300${movie.posterPath}`
      : null;

    const bars = [
      { label: "Story", score: rating.storyScore },
      { label: "Style", score: rating.styleScore },
      { label: "Emotion", score: rating.emotiveScore },
      { label: "Performance", score: rating.actingScore },
      { label: "Entertainment", score: rating.entertainScore },
    ].filter((b) => b.score != null) as { label: string; score: number }[];

    const scoreColor = scoreHex(rating.ratistRating);

    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 630,
            display: "flex",
            background: "#0f0f0f",
            fontFamily: "sans-serif",
            position: "relative",
          }}
        >
          {/* Poster on left */}
          {posterUrl && (
            <img
              src={posterUrl}
              style={{ width: 210, height: 630, objectFit: "cover", flexShrink: 0 }}
              alt=""
            />
          )}

          {/* Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "52px 56px" }}>
            {/* Branding */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 36 }}>
              <span style={{ color: "#ef3b36", fontWeight: 900, fontSize: 22, letterSpacing: "-0.5px" }}>
                THE RATIST
              </span>
            </div>

            {/* Movie title */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 28 }}>
              <span style={{ color: "#ffffff", fontSize: 38, fontWeight: 800, lineHeight: 1.15, maxWidth: 700 }}>
                {movie.title}
              </span>
              {movie.releaseDate && (
                <span style={{ color: "#888888", fontSize: 18, marginTop: 6 }}>
                  {movie.releaseDate.slice(0, 4)}
                </span>
              )}
            </div>

            {/* User + Score row */}
            <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 36 }}>
              <span style={{ color: "#aaaaaa", fontSize: 20 }}>{user.name} rated</span>
              <span style={{ color: scoreColor, fontSize: 56, fontWeight: 900, lineHeight: 1 }}>
                {rating.ratistRating.toFixed(1)}
              </span>
              <span style={{ color: "#666666", fontSize: 24, fontWeight: 600 }}>/10</span>
            </div>

            {/* Category bars */}
            {bars.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {bars.map(({ label, score }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: "#888888", fontSize: 15, width: 110, flexShrink: 0 }}>{label}</span>
                    <div style={{ flex: 1, height: 8, background: "#2a2a2a", borderRadius: 4, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${(score / 10) * 100}%`,
                          height: "100%",
                          background: scoreHex(score),
                          borderRadius: 4,
                        }}
                      />
                    </div>
                    <span style={{ color: scoreHex(score), fontSize: 15, fontWeight: 700, width: 30, textAlign: "right" }}>
                      {score.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: "auto", color: "#555555", fontSize: 16 }}>
              theratist.com
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch {
    return new Response("Error generating image", { status: 500 });
  }
}
