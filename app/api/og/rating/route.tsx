import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";
  const tmdbId = searchParams.get("tmdbId") ?? "";

  try {
    const logoSrc = getLogoBase64();

    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { firebaseUid: userId }] },
      select: { id: true, name: true, avatarUrl: true },
    });
    const movie = await prisma.movie.findUnique({
      where: { tmdbId: Number(tmdbId) },
      select: { title: true, posterPath: true, releaseDate: true },
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

    const bars = [
      { label: "Story", score: rating.storyScore },
      { label: "Style", score: rating.styleScore },
      { label: "Emotion", score: rating.emotiveScore },
      { label: "Acting", score: rating.actingScore },
      { label: "Fun", score: rating.entertainScore },
    ].filter((b) => b.score != null) as { label: string; score: number }[];

    const scoreColor = scoreHex(rating.ratistRating);
    const posterSrc = movie.posterPath ? `https://image.tmdb.org/t/p/w300${movie.posterPath}` : null;
    const avatarSrc = user.avatarUrl;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 48 }}>
          {/* Header: logo + user */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={36} height={36} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: 1 }}>THE RATIST</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {avatarSrc ? (
                <img src={avatarSrc} width={28} height={28} style={{ borderRadius: 14 }} />
              ) : (
                <div style={{ display: "flex", width: 28, height: 28, borderRadius: 14, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontWeight: 800, fontSize: 14 }}>{user.name[0]?.toUpperCase()}</span>
                </div>
              )}
              <span style={{ color: "#aaa", fontSize: 16, fontWeight: 600 }}>{user.name}</span>
            </div>
          </div>

          {/* Main content */}
          <div style={{ display: "flex", flex: 1, gap: 40 }}>
            {posterSrc ? (
              <img src={posterSrc} width={240} height={360} style={{ borderRadius: 12, objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", width: 240, height: 360, borderRadius: 12, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#555", fontSize: 40 }}>?</span>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <span style={{ color: "white", fontSize: 28, fontWeight: 800, lineHeight: 1.2, marginBottom: 4 }}>
                {movie.title.length > 40 ? movie.title.slice(0, 40) + "..." : movie.title}
              </span>
              {movie.releaseDate && (
                <span style={{ color: "#666", fontSize: 16, marginBottom: 24 }}>{movie.releaseDate.slice(0, 4)}</span>
              )}

              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 32 }}>
                <span style={{ color: scoreColor, fontSize: 64, fontWeight: 900, lineHeight: 1 }}>{rating.ratistRating.toFixed(1)}</span>
                <span style={{ color: "#444", fontSize: 24, fontWeight: 600 }}>/10</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {bars.map(({ label, score }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: "#888", fontSize: 14, width: 64 }}>{label}</span>
                    <div style={{ display: "flex", flex: 1, height: 10, backgroundColor: "#1a1a1a", borderRadius: 5, overflow: "hidden" }}>
                      <div style={{ width: `${(score / 10) * 100}%`, height: 10, backgroundColor: scoreHex(score), borderRadius: 5 }} />
                    </div>
                    <span style={{ color: scoreHex(score), fontSize: 14, fontWeight: 800, width: 32 }}>{score.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            <span style={{ color: "#333", fontSize: 14 }}>theratist.com</span>
          </div>
        </div>
      ),
      { width: 800, height: 500 }
    );
  } catch (err) {
    console.error("OG rating error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
