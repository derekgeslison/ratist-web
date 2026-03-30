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
      select: { id: true, name: true, avatarUrl: true },
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
            title: true, posterPath: true,
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

    const posterUrls = topMovies
      .filter((m) => m.movie.posterPath)
      .map((m) => `https://image.tmdb.org/t/p/w185${m.movie.posterPath}`);

    const avatarSrc = user.avatarUrl ?? null;

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
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #1a0808 0%, #0a0a0a 25%, #0a0a0a 100%)", display: "flex" }} />

          <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, padding: "56px 64px" }}>
            {/* Top bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 48 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "#ef3b36", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#fff", fontWeight: 900, fontSize: 22, lineHeight: 1 }}>R</span>
                </div>
                <span style={{ color: "#ef3b36", fontWeight: 800, fontSize: 20 }}>THE RATIST</span>
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

            {/* Year headline */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 48 }}>
              <span style={{ color: "#ef3b36", fontSize: 22, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
                Year In Film
              </span>
              <span style={{ color: "#ffffff", fontSize: 96, fontWeight: 900, lineHeight: 1 }}>{year}</span>
            </div>

            {/* Stats grid */}
            <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 56 }}>
              {[
                { value: seenThisYear.length.toString(), label: "Watched" },
                { value: rated.length.toString(), label: "Rated" },
                ...(avgRating != null ? [{ value: avgRating.toFixed(1), label: "Avg Rating", color: scoreHex(avgRating) }] : []),
              ].map(({ value, label, color }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    background: "#141414",
                    borderRadius: 16,
                    padding: "28px 36px",
                    minWidth: 140,
                  }}
                >
                  <span style={{ color: color ?? "#ffffff", fontSize: 48, fontWeight: 900, lineHeight: 1 }}>{value}</span>
                  <span style={{ color: "#666666", fontSize: 16, marginTop: 8 }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Top movies poster grid (2x3) */}
            {posterUrls.length > 0 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", marginBottom: 40 }}>
                {posterUrls.slice(0, 6).map((url, i) => (
                  <div
                    key={i}
                    style={{
                      width: 140,
                      height: 210,
                      borderRadius: 10,
                      overflow: "hidden",
                      position: "relative",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    <img src={url} style={{ width: 140, height: 210, objectFit: "cover" }} alt="" />
                    {topMovies[i]?.movie.ratings[0]?.ratistRating != null && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: 6,
                          right: 6,
                          background: "rgba(0,0,0,0.85)",
                          borderRadius: 6,
                          padding: "2px 8px",
                          color: scoreHex(topMovies[i].movie.ratings[0]!.ratistRating!),
                          fontWeight: 800,
                          fontSize: 14,
                        }}
                      >
                        {topMovies[i].movie.ratings[0]!.ratistRating!.toFixed(1)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Top movie titles */}
            {topMovies.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 32 }}>
                <span style={{ color: "#555555", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Top Rated</span>
                {topMovies.slice(0, 3).map((m, i) => (
                  <span key={i} style={{ color: "#cccccc", fontSize: 16, fontWeight: 600 }}>
                    {i + 1}. {m.movie.title} — <span style={{ color: scoreHex(m.movie.ratings[0]!.ratistRating!) }}>{m.movie.ratings[0]!.ratistRating!.toFixed(1)}</span>
                  </span>
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
    return new Response("Error", { status: 500 });
  }
}
