import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";
  const year = searchParams.get("year") ?? new Date().getFullYear().toString();

  try {
    const logoSrc = getLogoBase64();

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
            title: true,
            genres: { include: { genre: true } },
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
      .slice(0, 5);

    // Top genres by count
    const genreCount = new Map<string, number>();
    for (const s of seenThisYear) {
      for (const mg of s.movie.genres) {
        genreCount.set(mg.genre.name, (genreCount.get(mg.genre.name) ?? 0) + 1);
      }
    }
    const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    const avatarSrc = user.avatarUrl;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 44 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <img src={logoSrc} width={36} height={36} style={{ borderRadius: 6 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {avatarSrc ? (
                <img src={avatarSrc} width={24} height={24} style={{ borderRadius: 12 }} />
              ) : (
                <div style={{ display: "flex", width: 24, height: 24, borderRadius: 12, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontWeight: 800, fontSize: 12 }}>{user.name[0]?.toUpperCase()}</span>
                </div>
              )}
              <span style={{ color: "#aaa", fontSize: 14, fontWeight: 600 }}>{user.name}</span>
            </div>
          </div>

          {/* Year title */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
            <span style={{ color: "#ef3b36", fontSize: 13, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" as const, marginBottom: 2 }}>Year In Film</span>
            <span style={{ color: "white", fontSize: 60, fontWeight: 900, lineHeight: 1 }}>{year}</span>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 10, padding: "12px 24px" }}>
              <span style={{ color: "white", fontSize: 32, fontWeight: 900 }}>{seenThisYear.length}</span>
              <span style={{ color: "#666", fontSize: 12 }}>Watched</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 10, padding: "12px 24px" }}>
              <span style={{ color: "white", fontSize: 32, fontWeight: 900 }}>{rated.length}</span>
              <span style={{ color: "#666", fontSize: 12 }}>Rated</span>
            </div>
            {avgRating != null && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 10, padding: "12px 24px" }}>
                <span style={{ color: scoreHex(avgRating), fontSize: 32, fontWeight: 900 }}>{avgRating.toFixed(1)}</span>
                <span style={{ color: "#666", fontSize: 12 }}>Avg Rating</span>
              </div>
            )}
            {topGenres.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 10, padding: "12px 24px" }}>
                <span style={{ color: "#eab308", fontSize: 20, fontWeight: 800 }}>{topGenres[0][0]}</span>
                <span style={{ color: "#666", fontSize: 12 }}>Top Genre</span>
              </div>
            )}
          </div>

          {/* Top movies */}
          {topMovies.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
              <span style={{ color: "#555", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 2 }}>Top Rated</span>
              {topMovies.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#444", fontSize: 13, fontWeight: 800, width: 18 }}>{i + 1}</span>
                  <span style={{ color: "#ccc", fontSize: 15, fontWeight: 600, flex: 1 }}>
                    {m.movie.title.length > 42 ? m.movie.title.slice(0, 42) + "..." : m.movie.title}
                  </span>
                  <span style={{ color: scoreHex(m.movie.ratings[0]!.ratistRating!), fontSize: 15, fontWeight: 800 }}>
                    {m.movie.ratings[0]!.ratistRating!.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Top genres chips */}
          {topGenres.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <span style={{ color: "#555", fontSize: 12 }}>Genres:</span>
              {topGenres.map(([name, count]) => (
                <span key={name} style={{ color: "#888", fontSize: 12, backgroundColor: "#141414", borderRadius: 6, padding: "2px 8px" }}>
                  {name} ({count})
                </span>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <span style={{ color: "#333", fontSize: 13 }}>theratist.com</span>
          </div>
        </div>
      ),
      { width: 800, height: 520 }
    );
  } catch (err) {
    console.error("OG year-in-review error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
