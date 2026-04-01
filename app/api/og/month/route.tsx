import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth());

  try {
    const logoSrc = getLogoBase64();

    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { firebaseUid: userId }] },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!user) return new Response("Not found", { status: 404 });

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 1);

    const seenThisMonth = await prisma.userFavoriteMovie.findMany({
      where: {
        userId: user.id,
        watchedDate: { gte: startDate, lt: endDate },
      },
      include: {
        movie: {
          select: {
            title: true, posterPath: true,
            genres: { include: { genre: true } },
            ratings: { where: { userId: user.id }, select: { ratistRating: true }, take: 1 },
          },
        },
      },
    });

    if (seenThisMonth.length === 0) return new Response("No data", { status: 404 });

    const rated = seenThisMonth.filter((m) => m.movie.ratings[0]?.ratistRating != null);
    const avgRating = rated.length > 0
      ? rated.reduce((s, m) => s + m.movie.ratings[0]!.ratistRating!, 0) / rated.length
      : null;

    // Top genre
    const genreCount = new Map<string, number>();
    for (const s of seenThisMonth) {
      for (const mg of s.movie.genres) {
        genreCount.set(mg.genre.name, (genreCount.get(mg.genre.name) ?? 0) + 1);
      }
    }
    const topGenre = [...genreCount.entries()].sort((a, b) => b[1] - a[1])[0];

    // Top 5 posters
    const topPosters = seenThisMonth
      .filter((m) => m.movie.posterPath)
      .sort((a, b) => (b.movie.ratings[0]?.ratistRating ?? 0) - (a.movie.ratings[0]?.ratistRating ?? 0))
      .slice(0, 5)
      .map((m) => `https://image.tmdb.org/t/p/w185${m.movie.posterPath}`);

    const avatarSrc = user.avatarUrl;
    const monthLabel = `${MONTH_NAMES[month]} ${year}`;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 40 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>THE RATIST</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {avatarSrc ? (
                <img src={avatarSrc} width={24} height={24} style={{ borderRadius: 12 }} />
              ) : (
                <div style={{ display: "flex", width: 24, height: 24, borderRadius: 12, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontWeight: 800, fontSize: 12 }}>{user.name[0]?.toUpperCase()}</span>
                </div>
              )}
              <span style={{ color: "#aaa", fontSize: 14 }}>{user.name}</span>
            </div>
          </div>

          {/* Month title */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
            <span style={{ color: "#ef3b36", fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" as const, marginBottom: 4 }}>Monthly Recap</span>
            <span style={{ color: "white", fontSize: 36, fontWeight: 900 }}>{monthLabel}</span>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 10, padding: "12px 24px" }}>
              <span style={{ color: "white", fontSize: 28, fontWeight: 900 }}>{seenThisMonth.length}</span>
              <span style={{ color: "#666", fontSize: 12 }}>Watched</span>
            </div>
            {avgRating != null && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 10, padding: "12px 24px" }}>
                <span style={{ color: scoreHex(avgRating), fontSize: 28, fontWeight: 900 }}>{avgRating.toFixed(1)}</span>
                <span style={{ color: "#666", fontSize: 12 }}>Avg Rating</span>
              </div>
            )}
            {topGenre && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#141414", borderRadius: 10, padding: "12px 24px", minWidth: 100 }}>
                <span style={{ color: "#eab308", fontSize: topGenre[0].length > 8 ? 15 : 18, fontWeight: 800, lineHeight: 1.5 }}>{topGenre[0]}</span>
                <span style={{ color: "#666", fontSize: 12 }}>Top Genre</span>
              </div>
            )}
          </div>

          {/* Top movies list */}
          {rated.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              <span style={{ color: "#555", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 4 }}>Top Rated</span>
              {rated
                .sort((a, b) => (b.movie.ratings[0]?.ratistRating ?? 0) - (a.movie.ratings[0]?.ratistRating ?? 0))
                .slice(0, 5)
                .map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#444", fontSize: 13, fontWeight: 800, width: 18 }}>{i + 1}</span>
                    <span style={{ color: "#ccc", fontSize: 14, fontWeight: 600, flex: 1 }}>
                      {m.movie.title.length > 35 ? m.movie.title.slice(0, 35) + "..." : m.movie.title}
                    </span>
                    <span style={{ color: scoreHex(m.movie.ratings[0]!.ratistRating!), fontSize: 14, fontWeight: 800 }}>
                      {m.movie.ratings[0]!.ratistRating!.toFixed(1)}
                    </span>
                  </div>
                ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
            <span style={{ color: "#333", fontSize: 12 }}>theratist.com</span>
          </div>
        </div>
      ),
      { width: 700, height: 460 }
    );
  } catch (err) {
    console.error("OG month error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
