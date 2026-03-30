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
            title: true,
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

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 48 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", width: 32, height: 32, borderRadius: 6, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "white", fontWeight: 900, fontSize: 20 }}>R</span>
              </div>
              <span style={{ color: "#ef3b36", fontWeight: 800, fontSize: 18 }}>THE RATIST</span>
            </div>
            <span style={{ color: "#888", fontSize: 16 }}>{user.name}</span>
          </div>

          {/* Year title */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
            <span style={{ color: "#ef3b36", fontSize: 16, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" as const, marginBottom: 4 }}>Year In Film</span>
            <span style={{ color: "white", fontSize: 72, fontWeight: 900, lineHeight: 1 }}>{year}</span>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 28 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 12, padding: "16px 28px" }}>
              <span style={{ color: "white", fontSize: 36, fontWeight: 900 }}>{seenThisYear.length}</span>
              <span style={{ color: "#666", fontSize: 13 }}>Watched</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 12, padding: "16px 28px" }}>
              <span style={{ color: "white", fontSize: 36, fontWeight: 900 }}>{rated.length}</span>
              <span style={{ color: "#666", fontSize: 13 }}>Rated</span>
            </div>
            {avgRating != null && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 12, padding: "16px 28px" }}>
                <span style={{ color: scoreHex(avgRating), fontSize: 36, fontWeight: 900 }}>{avgRating.toFixed(1)}</span>
                <span style={{ color: "#666", fontSize: 13 }}>Avg Rating</span>
              </div>
            )}
          </div>

          {/* Top movies list */}
          {topMovies.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <span style={{ color: "#555", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 4 }}>Top Rated</span>
              {topMovies.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: "#444", fontSize: 14, fontWeight: 800, width: 20 }}>{i + 1}</span>
                  <span style={{ color: "#ccc", fontSize: 16, fontWeight: 600, flex: 1 }}>
                    {m.movie.title.length > 45 ? m.movie.title.slice(0, 45) + "..." : m.movie.title}
                  </span>
                  <span style={{ color: scoreHex(m.movie.ratings[0]!.ratistRating!), fontSize: 16, fontWeight: 800 }}>
                    {m.movie.ratings[0]!.ratistRating!.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <span style={{ color: "#333", fontSize: 14 }}>theratist.com</span>
          </div>
        </div>
      ),
      { width: 800, height: 500 }
    );
  } catch (err) {
    console.error("OG year-in-review error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
