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
    if (!user || !movie) return new Response("Not found", { status: 404 });

    const rating = await prisma.movieRating.findFirst({
      where: { userId: user.id, movie: { tmdbId: Number(tmdbId) } },
      select: {
        ratistRating: true,
        storyScore: true, styleScore: true,
        emotiveScore: true, actingScore: true, entertainScore: true,
      },
    });
    if (!rating?.ratistRating) return new Response("No rating", { status: 404 });

    const posterSrc = movie.posterPath
      ? `https://image.tmdb.org/t/p/w342${movie.posterPath}`
      : null;
    const avatarSrc = user.avatarUrl ?? null;

    const bars = [
      { label: "Story & Writing", score: rating.storyScore },
      { label: "Style & Craft", score: rating.styleScore },
      { label: "Emotion & Meaning", score: rating.emotiveScore },
      { label: "Performance", score: rating.actingScore },
      { label: "Entertainment", score: rating.entertainScore },
    ].filter((b) => b.score != null) as { label: string; score: number }[];

    const scoreColor = scoreHex(rating.ratistRating);

    return new ImageResponse(
      (
        <div
          style={{
            width: 1080,
            height: 1350,
            display: "flex",
            flexDirection: "column",
            background: "#0a0a0a",
            fontFamily: "sans-serif",
            position: "relative",
          }}
        >
          {/* Subtle gradient overlay */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #1a0808 0%, #0a0a0a 30%, #0a0a0a 100%)", display: "flex" }} />

          {/* Content */}
          <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, padding: "56px 64px" }}>
            {/* Top bar: Ratist branding + user */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 48 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "#ef3b36", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#fff", fontWeight: 900, fontSize: 22, lineHeight: 1 }}>R</span>
                </div>
                <span style={{ color: "#ef3b36", fontWeight: 800, fontSize: 20, letterSpacing: "-0.3px" }}>THE RATIST</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, overflow: "hidden", background: "#ef3b36", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {avatarSrc ? (
                    <img src={avatarSrc} style={{ width: 36, height: 36, objectFit: "cover" }} alt="" />
                  ) : (
                    <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{user.name[0]?.toUpperCase()}</span>
                  )}
                </div>
                <span style={{ color: "#aaaaaa", fontSize: 18, fontWeight: 600 }}>{user.name}</span>
              </div>
            </div>

            {/* Movie poster */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
              {posterSrc ? (
                <div style={{ width: 280, height: 420, borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
                  <img src={posterSrc} style={{ width: 280, height: 420, objectFit: "cover" }} alt="" />
                </div>
              ) : (
                <div style={{ width: 280, height: 420, borderRadius: 16, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#555", fontSize: 48 }}>?</span>
                </div>
              )}
            </div>

            {/* Title + year */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "#ffffff", fontSize: 32, fontWeight: 800, textAlign: "center", lineHeight: 1.2, maxWidth: 800 }}>
                {movie.title}
              </span>
              {movie.releaseDate && (
                <span style={{ color: "#666666", fontSize: 18, marginTop: 6 }}>{movie.releaseDate.slice(0, 4)}</span>
              )}
            </div>

            {/* Score */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8, marginBottom: 40 }}>
              <span style={{ color: scoreColor, fontSize: 72, fontWeight: 900, lineHeight: 1 }}>
                {rating.ratistRating.toFixed(1)}
              </span>
              <span style={{ color: "#444444", fontSize: 28, fontWeight: 600 }}>/10</span>
            </div>

            {/* Category bars */}
            {bars.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "0 20px" }}>
                {bars.map(({ label, score }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{ color: "#888888", fontSize: 16, width: 160, flexShrink: 0, textAlign: "right" }}>{label}</span>
                    <div style={{ flex: 1, height: 12, background: "#1a1a1a", borderRadius: 6, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${(score / 10) * 100}%`,
                          height: "100%",
                          background: scoreHex(score),
                          borderRadius: 6,
                        }}
                      />
                    </div>
                    <span style={{ color: scoreHex(score), fontSize: 18, fontWeight: 800, width: 40, textAlign: "right" }}>
                      {score.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: "auto", display: "flex", justifyContent: "center" }}>
              <span style={{ color: "#333333", fontSize: 16 }}>theratist.com</span>
            </div>
          </div>
        </div>
      ),
      { width: 1080, height: 1350 }
    );
  } catch {
    return new Response("Error generating image", { status: 500 });
  }
}
